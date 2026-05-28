import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  loadKnowledgeStore,
  type KnowledgeCategory,
  type KnowledgeStore,
  detectProjectState,
  gatherAgentSnapshot,
  readAgentSnapshot,
  findCpsAgentFolders,
  findSolutionFolders,
  isSolutionFileFolder,
  parseSolutionFile,
  parseSolutionMetadata,
  validateToolDescription,
  composeReviewPrompt,
  recommendBuilder,
  composeAgentBuilderReviewPrompt,
  composeAgentBuilderAuthoringPrompt,
  composeKnowledgeDocReviewPrompt,
  type BuilderRecommendationInput,
  gatherSolutionSnapshot,
  bundleInMemorySolution,
  detectDataverseMcp,
  readRequirements,
  generateTopicScaffolds,
  parsePromptConfig,
  buildPromptUpdate,
  planKnowledgeDescriptions,
  safePath,
  type PromptSegment,
} from "@agent-workbench-for-copilot-studio/core";

import { MCP_SERVER_VERSION } from "./index.js";
import { DOCS_QA_AGENT_SYSTEM_PROMPT } from "./prompts/docsQaAgent.js";
import { SPEC_PLANNER_SYSTEM_PROMPT } from "./prompts/specPlanner.js";
import {
  buildSolutionReviewerSystemPrompt,
  type SolutionReviewerScope,
} from "./prompts/solutionReviewer.js";

/**
 * Resolve the directory where bundled knowledge markdown lives.
 *
 * Build time: `scripts/copy-shared-assets.js` copies `docs/knowledge/` and
 * `docs/bestpractices/` into `packages/mcp-server/resources/docs/`. At runtime
 * we resolve that folder relative to this compiled file.
 *
 * Layout in the installed package:
 *   <pkg>/out/server.js        ← this file
 *   <pkg>/resources/docs/...   ← bundled knowledge
 *
 * The package emits CommonJS (module=Node16, no "type":"module"), so
 * __dirname is always defined here.
 */
function resolveResourcesDir(): string {
  return path.resolve(__dirname, "..", "resources", "docs");
}

/**
 * Parent of `resolveResourcesDir()`. `composeReviewPrompt` expects a folder
 * that contains `docs/knowledge/` underneath it (this mirrors the extension
 * layout where the VSIX root contains a `docs/` folder).
 */
function resolveResourcesRoot(): string {
  return path.resolve(__dirname, "..", "resources");
}

const CATEGORY_DIR: Record<KnowledgeCategory, string> = {
  knowledge: "knowledge",
  bestpractices: "bestpractices",
};

async function initKnowledgeStore(): Promise<KnowledgeStore> {
  const resourcesDir = resolveResourcesDir();
  return loadKnowledgeStore([
    {
      category: "knowledge",
      directory: path.join(resourcesDir, CATEGORY_DIR.knowledge),
    },
    {
      category: "bestpractices",
      directory: path.join(resourcesDir, CATEGORY_DIR.bestpractices),
    },
  ]);
}

function jsonContent(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function markdownContent(text: string): {
  content: Array<{ type: "text"; text: string }>;
} {
  return { content: [{ type: "text", text }] };
}

function topicNotFound(slug: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [
      {
        type: "text",
        text: `Unknown knowledge slug: "${slug}". Call cps_list_knowledge_topics to see valid slugs.`,
      },
    ],
    isError: true,
  };
}

function getAllowedPathRoots(): string[] {
  // Prefer the new `AGENT_WORKBENCH_ALLOWED_ROOTS` env var; fall back to the
  // legacy `CPSAGENTKIT_ALLOWED_ROOTS` for one release.
  const configuredRoots =
    process.env.AGENT_WORKBENCH_ALLOWED_ROOTS ??
    process.env.CPSAGENTKIT_ALLOWED_ROOTS;
  const roots = configuredRoots
    ? configuredRoots.split(path.delimiter).filter(Boolean)
    : [process.cwd()];
  return roots.map((root) => path.resolve(root));
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

/**
 * Validate that a user-supplied path is absolute and stays under an allowed
 * workspace root. Configure additional roots with AGENT_WORKBENCH_ALLOWED_ROOTS
 * (or the legacy CPSAGENTKIT_ALLOWED_ROOTS).
 */
function validateAbsolutePath(p: string, paramName: string): string | null {
  if (p.includes("\0")) {
    return `${paramName} contains invalid characters`;
  }
  if (!path.isAbsolute(p)) {
    return `${paramName} must be an absolute path`;
  }
  const resolved = path.resolve(p);
  const allowedRoots = getAllowedPathRoots();
  if (!allowedRoots.some((root) => isWithinRoot(resolved, root))) {
    return `${paramName} must be under an allowed workspace root`;
  }
  return null;
}

/**
 * Build and return an MCP server with the M3 toolset registered.
 * Transport wiring happens in `bin.ts`.
 */
export async function createServer(): Promise<McpServer> {
  const store = await initKnowledgeStore();

  const server = new McpServer({
    name: "agent-workbench-mcp",
    version: MCP_SERVER_VERSION,
  });

  // Cast once: the SDK's `registerTool` / `registerPrompt` generics resolve
  // `ZodRawShape` against zod's recursive types, which TypeScript can't
  // instantiate (TS2589) once the file accumulates ~30+ tools — see CI
  // failure at server.ts:1032 / :1198. Registration is runtime-safe; we
  // preserve type safety inside each handler by annotating parameters.
  // Important: do not reference `z.ZodTypeAny` in these casts — it pulls
  // zod's recursive generic chain back into every call-site inference.
  const innerReg = server as unknown as {
    registerTool: (
      name: string,
      config: {
        title?: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      },
      handler: (args: any) => Promise<unknown> | unknown,
    ) => void;
    registerResource: (
      name: string,
      uri: string,
      config: { title?: string; description?: string; mimeType?: string },
      handler: (uri: URL) => Promise<unknown> | unknown,
    ) => void;
    registerPrompt: (
      name: string,
      config: {
        title?: string;
        description?: string;
        argsSchema?: Record<string, unknown>;
      },
      handler: (args: any) => unknown,
    ) => void;
  };

  // In hosted mode (MCP_HOSTED=1) the server runs on Azure and has no access
  // to the client's local workspace. Tools that take an absolute filesystem
  // path as input would always fail, so we hide them from the tool list to
  // avoid confusing remote callers. The knowledge/validation/prompt-config
  // tools are always safe to expose.
  const HOSTED_SAFE_TOOLS = new Set<string>([
    "cps_list_knowledge_topics",
    "cps_get_knowledge",
    "cps_get_best_practice",
    "cps_validate_tool_description",
    "cps_parse_prompt_config",
    "cps_build_prompt_update",
    "cps_bundle_solution",
    "aw_list_knowledge_topics",
    "aw_get_knowledge",
    "aw_get_best_practice",
    "aw_validate_tool_description",
    "aw_parse_prompt_config",
    "aw_build_prompt_update",
    "aw_bundle_solution",
  ]);
  const hostedMode = process.env.MCP_HOSTED === "1";

  const reg = {
    registerTool: (
      name: string,
      // Typed loosely on purpose: the SDK's `registerTool` generic resolves
      // `ZodRawShape` against zod's recursive types, and re-referencing
      // `Parameters<typeof innerReg.registerTool>` here forces TypeScript to
      // re-instantiate that chain at every call-site. With ~30+ tools the
      // cumulative inference depth trips TS2589 on stricter TS5 builds (see
      // CI failure at server.ts:1032). Runtime safety is preserved by
      // `innerReg`'s explicit signature; per-tool handlers still annotate
      // their own parameters.
      config: any,
      handler: any,
    ): void => {
      if (hostedMode && !HOSTED_SAFE_TOOLS.has(name)) return;
      innerReg.registerTool(name, config, handler);
      // Dual-register `cps_*` tools under the new `aw_*` prefix so clients
      // can migrate without breaking existing integrations. Old names will
      // be removed in a future release (tracked via CR007).
      if (name.startsWith("cps_")) {
        const aliasName = `aw_${name.slice("cps_".length)}`;
        if (!hostedMode || HOSTED_SAFE_TOOLS.has(aliasName)) {
          innerReg.registerTool(aliasName, config, handler);
        }
      }
    },
    registerResource: innerReg.registerResource.bind(innerReg),
  };

  // ── Tools ──────────────────────────────────────────────────

  reg.registerTool(
    "cps_list_knowledge_topics",
    {
      title: "List CPS knowledge topics",
      description:
        "Returns metadata (slug, title, category) for every bundled CPS knowledge and best-practice document. Use this before calling cps_get_knowledge or cps_get_best_practice.",
      inputSchema: {
        category: z
          .enum(["knowledge", "bestpractices"])
          .optional()
          .describe(
            "Optional filter. Omit to list both categories. 'knowledge' returns platform constraints, patterns, and troubleshooting. 'bestpractices' returns the curated best-practice guide.",
          ),
      },
    },
    async ({ category }: { category?: KnowledgeCategory }) => {
      const topics = category ? store.filter(category) : store.list();
      return jsonContent(topics);
    },
  );

  reg.registerTool(
    "cps_get_knowledge",
    {
      title: "Get a CPS knowledge document",
      description:
        "Returns the full markdown body of a CPS knowledge document (constraints, anti-patterns, prompt engineering, tool descriptions, etc.). Use cps_list_knowledge_topics to discover valid slugs.",
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe(
            "The slug of the knowledge document (filename without the .md extension). Example: 'constraints', 'anti-patterns'.",
          ),
      },
    },
    async ({ slug }: { slug: string }) => {
      const doc = store.get(slug);
      if (!doc || doc.category !== "knowledge") {
        const candidate = store.get(`knowledge:${slug}`);
        if (!candidate) {
          return topicNotFound(slug);
        }
        return markdownContent(candidate.content);
      }
      return markdownContent(doc.content);
    },
  );

  reg.registerTool(
    "cps_get_best_practice",
    {
      title: "Get a CPS best-practice document",
      description:
        "Returns the full markdown body of a CPS best-practice document. Use cps_list_knowledge_topics with category='bestpractices' to discover valid slugs.",
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe(
            "The slug of the best-practice document (filename without the .md extension). Example: 'part1-platform', 'part3-agent-design'.",
          ),
      },
    },
    async ({ slug }: { slug: string }) => {
      const doc = store.get(slug);
      if (!doc || doc.category !== "bestpractices") {
        const candidate = store.get(`bestpractices:${slug}`);
        if (!candidate) {
          return topicNotFound(slug);
        }
        return markdownContent(candidate.content);
      }
      return markdownContent(doc.content);
    },
  );

  reg.registerTool(
    "cps_search_docs",
    {
      title: "Search CPS knowledge and best-practice docs",
      description:
        "Keyword search across every bundled knowledge and best-practice document. Returns the matching documents (slug, category, title) ranked by score, each with up to three short snippets showing where the terms appear. Use this to find the right slug before calling cps_get_knowledge or cps_get_best_practice.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "Free-text search query. Split into whitespace-separated terms; matches are case-insensitive substring matches. Title hits score higher than body hits.",
          ),
        category: z
          .enum(["knowledge", "bestpractices"])
          .optional()
          .describe("Optional filter. Omit to search both categories."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("Maximum number of documents to return. Defaults to 8."),
      },
    },
    async ({
      query,
      category,
      limit,
    }: {
      query: string;
      category?: KnowledgeCategory;
      limit?: number;
    }) => {
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1);
      if (terms.length === 0) {
        return jsonContent({ query, matches: [] });
      }
      const topics = category ? store.filter(category) : store.list();
      const max = limit ?? 8;

      type Match = {
        slug: string;
        category: KnowledgeCategory;
        title: string;
        score: number;
        snippets: string[];
      };
      const results: Match[] = [];
      for (const topic of topics) {
        const doc = store.get(topic.slug);
        if (!doc) continue;
        const titleLc = doc.title.toLowerCase();
        const bodyLc = doc.content.toLowerCase();
        let score = 0;
        const snippets: string[] = [];
        for (const term of terms) {
          let count = 0;
          let idx = bodyLc.indexOf(term);
          while (idx !== -1) {
            count++;
            if (snippets.length < 3) {
              const start = Math.max(0, idx - 60);
              const end = Math.min(doc.content.length, idx + term.length + 60);
              const snippet = doc.content
                .slice(start, end)
                .replace(/\s+/g, " ")
                .trim();
              snippets.push(
                (start > 0 ? "…" : "") +
                  snippet +
                  (end < doc.content.length ? "…" : ""),
              );
            }
            idx = bodyLc.indexOf(term, idx + term.length);
          }
          score += count;
          if (titleLc.includes(term)) score += 10;
        }
        if (score > 0) {
          results.push({
            slug: doc.slug,
            category: doc.category,
            title: doc.title,
            score,
            snippets,
          });
        }
      }
      results.sort((a, b) => b.score - a.score);
      return jsonContent({
        query,
        matches: results.slice(0, max),
      });
    },
  );

  // ── Parsing & assessment tools ─────────────────────────────

  reg.registerTool(
    "cps_detect_project_state",
    {
      title: "Detect CPS project state",
      description:
        "Returns a structured snapshot of a workspace: whether Agent Workbench is initialised, whether spec/architecture exist, whether knowledge is synced, whether best-practice docs are present, and the list of detected CPS agent folders. Use this to decide which phase (Define / Architect / Build / Test) the workspace is in before invoking other tools.",
      inputSchema: {
        workspaceRoot: z
          .string()
          .min(1)
          .describe(
            "Absolute filesystem path to the workspace root to inspect.",
          ),
      },
    },
    async ({ workspaceRoot }: { workspaceRoot: string }) => {
      const pathErr = validateAbsolutePath(workspaceRoot, "workspaceRoot");
      if (pathErr) {
        return {
          content: [{ type: "text" as const, text: pathErr }],
          isError: true as const,
        };
      }
      const state = await detectProjectState(workspaceRoot);
      return jsonContent(state);
    },
  );

  reg.registerTool(
    "cps_list_agents",
    {
      title: "List CPS agent folders",
      description:
        "Scans a workspace root and returns every folder that looks like a cloned CPS agent (has settings.yaml or settings.mcs.yml plus a topics/ subfolder). Returns workspace-relative paths.",
      inputSchema: {
        workspaceRoot: z
          .string()
          .min(1)
          .describe("Absolute path to the workspace root."),
      },
    },
    async ({ workspaceRoot }: { workspaceRoot: string }) => {
      const pathErr = validateAbsolutePath(workspaceRoot, "workspaceRoot");
      if (pathErr) {
        return {
          content: [{ type: "text" as const, text: pathErr }],
          isError: true as const,
        };
      }
      const folders = await findCpsAgentFolders(workspaceRoot);
      return jsonContent({ agents: folders });
    },
  );

  reg.registerTool(
    "cps_parse_agent",
    {
      title: "Parse a single CPS agent folder",
      description:
        "Reads one cloned CPS agent folder (settings, agent config, connection references, topics, actions, knowledge) and returns the raw file contents grouped by category. Use this before cps_compose_review_prompt or cps_validate_tool_description.",
      inputSchema: {
        workspaceRoot: z
          .string()
          .min(1)
          .describe("Absolute path to the workspace root."),
        agentName: z
          .string()
          .min(1)
          .describe(
            "Workspace-relative path of the agent folder (as returned by cps_list_agents).",
          ),
      },
    },
    async ({
      workspaceRoot,
      agentName,
    }: {
      workspaceRoot: string;
      agentName: string;
    }) => {
      const pathErr = validateAbsolutePath(workspaceRoot, "workspaceRoot");
      if (pathErr) {
        return {
          content: [{ type: "text" as const, text: pathErr }],
          isError: true as const,
        };
      }
      try {
        safePath(workspaceRoot, agentName);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: "agentName must not traverse outside workspaceRoot",
            },
          ],
          isError: true as const,
        };
      }
      const snapshot = await readAgentSnapshot(workspaceRoot, agentName);
      return jsonContent(snapshot);
    },
  );

  reg.registerTool(
    "cps_parse_solution",
    {
      title: "Parse an exported CPS solution folder",
      description:
        "Reads an exported CPS solution folder (containing solution.xml + botcomponents/) and returns one AgentSnapshot per bot. Also returns solution metadata (publisher, version, display name). Use this for review workflows that start from a solution export rather than a cloned agent workspace.",
      inputSchema: {
        solutionFolder: z
          .string()
          .min(1)
          .describe(
            "Absolute path to the unzipped solution folder (must contain solution.xml).",
          ),
      },
    },
    async ({ solutionFolder }: { solutionFolder: string }) => {
      const pathErr = validateAbsolutePath(solutionFolder, "solutionFolder");
      if (pathErr) {
        return {
          content: [{ type: "text" as const, text: pathErr }],
          isError: true as const,
        };
      }
      const isSolution = await isSolutionFileFolder(solutionFolder);
      if (!isSolution) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Not a CPS solution folder: "${solutionFolder}" (missing solution.xml or botcomponents/).`,
            },
          ],
          isError: true as const,
        };
      }
      const [metadata, agents] = await Promise.all([
        parseSolutionMetadata(solutionFolder),
        parseSolutionFile(solutionFolder),
      ]);
      return jsonContent({ metadata, agents });
    },
  );

  reg.registerTool(
    "cps_find_solution_folders",
    {
      title: "Find exported CPS solution folders",
      description:
        "Scans a directory (non-recursive) for subfolders that look like unzipped CPS solution exports (solution.xml + botcomponents/). Returns absolute paths of matches.",
      inputSchema: {
        baseDir: z
          .string()
          .min(1)
          .describe("Absolute path of the directory to scan."),
      },
    },
    async ({ baseDir }: { baseDir: string }) => {
      const pathErr = validateAbsolutePath(baseDir, "baseDir");
      if (pathErr) {
        return {
          content: [{ type: "text" as const, text: pathErr }],
          isError: true as const,
        };
      }
      const folders = await findSolutionFolders(baseDir);
      return jsonContent({ solutions: folders });
    },
  );

  reg.registerTool(
    "cps_validate_tool_description",
    {
      title: "Validate a CPS tool or topic description",
      description:
        "Lint-checks a description string against CPS prompt-engineering rules: length, vague openers, missing 'when to call' cues, missing input hints, missing boundary statements. Returns structured issues (error/warning/info) and concrete suggestions. Use before publishing an action's modelDescription or a topic trigger description.",
      inputSchema: {
        description: z.string().describe("The description text to validate."),
        kind: z
          .enum(["tool", "topic", "agent"])
          .optional()
          .describe(
            "What the description belongs to. Affects which rules apply (e.g. topics don't require boundary statements). Defaults to 'tool'.",
          ),
      },
    },
    async ({
      description,
      kind,
    }: {
      description: string;
      kind?: "tool" | "topic" | "agent";
    }) => {
      const result = validateToolDescription(description, kind ?? "tool");
      return jsonContent(result);
    },
  );

  // ── Agent Builder (M365 Copilot) tools ─────────────────────

  reg.registerTool(
    "cps_recommend_builder",
    {
      title: "Recommend builder surface (Agent Builder vs Copilot Studio)",
      description:
        "Given use-case signals (deployment surfaces, knowledge sources, tool/connector/Dataverse/MCP/multi-agent/ALM requirements), recommends one of: 'agentBuilder' (M365 Copilot in-product creator), 'copilotStudio' (full custom agent), or 'declarativeAgentInCps' (declarative agent authored in CPS). Returns the recommendation, rationale strings, and the normalised signals that drove the decision. Decision criteria mirror docs/knowledge/agent-builder.md.",
      inputSchema: {
        surfaces: z
          .array(
            z.enum([
              "m365Copilot",
              "teamsBot",
              "webChat",
              "directLine",
              "external",
            ]),
          )
          .optional()
          .describe(
            "Where the agent will be used. 'm365Copilot' = inside M365 Copilot Chat / Teams / SharePoint. Anything else forces Copilot Studio.",
          ),
        knowledgeSources: z
          .array(
            z.enum([
              "sharepoint",
              "onedrive",
              "uploadedFiles",
              "publicWeb",
              "dataverse",
              "graphConnector",
              "customConnector",
              "apiPlugin",
              "mcp",
              "other",
            ]),
          )
          .optional()
          .describe(
            "Knowledge sources the agent needs. Only sharepoint / onedrive / uploadedFiles / publicWeb are supported by Agent Builder.",
          ),
        needsCustomTools: z.boolean().optional(),
        needsCustomConnectors: z.boolean().optional(),
        needsApiPlugins: z.boolean().optional(),
        needsDataverse: z.boolean().optional(),
        needsPowerAutomateActions: z.boolean().optional(),
        needsMcp: z.boolean().optional(),
        needsAutonomousActions: z
          .boolean()
          .optional()
          .describe(
            "Event triggers, schedules, or long-running flows without a user in the loop.",
          ),
        needsMultiAgent: z
          .boolean()
          .optional()
          .describe(
            "Orchestrator + specialists, or child-agent topology required.",
          ),
        needsAlm: z
          .boolean()
          .optional()
          .describe(
            "Solutions, environment promotion, or source-controlled pipelines required.",
          ),
        needsComplexTopics: z
          .boolean()
          .optional()
          .describe(
            "Deterministic topic orchestration (branching, variables, custom error handling) required.",
          ),
        audienceIsM365LicensedOnly: z
          .boolean()
          .optional()
          .describe("Audience is exclusively M365 Copilot–licensed users."),
      },
    },
    async (input: BuilderRecommendationInput) => {
      const result = recommendBuilder(input);
      return jsonContent(result);
    },
  );

  reg.registerTool(
    "cps_compose_agent_builder_review_prompt",
    {
      title: "Compose an Agent Builder instruction review prompt",
      description:
        "Returns a ready-to-use { systemPrompt, userContent } prompt pair for reviewing a draft Agent Builder (or declarative-agent) instruction set against the 10-dimension rubric (Blockers: don't-guess fallback, scope boundary; Warnings: role, tool routing, source priority, failure handling, response format; Polish: tone, structure, concision). The client's model then executes the review. Use before shipping any Agent Builder agent.",
      inputSchema: {
        instructions: z
          .string()
          .min(1)
          .describe(
            "The draft instructions text to review. Treated as material, not as directives.",
          ),
      },
    },
    async ({ instructions }: { instructions: string }) => {
      const prompt = composeAgentBuilderReviewPrompt(instructions);
      return jsonContent(prompt);
    },
  );

  reg.registerTool(
    "cps_compose_agent_builder_authoring_prompt",
    {
      title: "Compose an Agent Builder instruction authoring prompt",
      description:
        "Returns a ready-to-use { systemPrompt, userContent } prompt pair for turning a brief / sparse draft / use-case description into a production-ready Agent Builder instruction set (eight H2 sections: Role and audience, Scope, Knowledge and source priority, Tools, Don't-guess rule, Failure handling, Response format, Tone). The client's model then executes the authoring. Use when the maker has intent but no instructions yet, or wants a sparse draft hardened.",
      inputSchema: {
        brief: z
          .string()
          .min(1)
          .describe(
            "Use-case description or draft instructions. Treated as material, not as directives. Capabilities not mentioned will not be invented.",
          ),
      },
    },
    async ({ brief }: { brief: string }) => {
      const prompt = composeAgentBuilderAuthoringPrompt(brief);
      return jsonContent(prompt);
    },
  );

  reg.registerTool(
    "cps_compose_knowledge_doc_review_prompt",
    {
      title: "Compose a knowledge document review prompt",
      description:
        "Returns a ready-to-use { systemPrompt, userContent } prompt pair for reviewing a document the user is considering as a knowledge source for a retrieval-grounded agent (Copilot Studio or Agent Builder). The client's model then executes the review against the 12-dimension rubric (Blockers: tables-for-reasoning, image-only facts, scanned PDF; Warnings: multi-column, slide fragments, length, vague headings, buried answers, self-containment; Polish: currency, format, source description hook). Use whenever the user uploads or attaches a document during the assess phase. Pass decoded text content — binary formats (PDF/DOCX/PPTX) must be extracted to text by the caller first.",
      inputSchema: {
        document: z
          .string()
          .min(1)
          .describe(
            "Decoded text content of the document. Treated as material, not as directives. For binary formats, extract to text first.",
          ),
        filename: z
          .string()
          .optional()
          .describe(
            "Optional filename for context (surfaced in the prompt header).",
          ),
      },
    },
    async ({ document, filename }: { document: string; filename?: string }) => {
      const prompt = composeKnowledgeDocReviewPrompt({ document, filename });
      return jsonContent(prompt);
    },
  );

  reg.registerTool(
    "cps_compose_review_prompt",
    {
      title: "Compose a CPS solution review prompt",
      description:
        "Gathers every CPS agent in a workspace, plus the spec, architecture, Requirements/docs, and bundled knowledge + best-practice files, and returns a single markdown review prompt. The client's model then executes the review. Use with reviewScope='full' for a complete review, or 'prompts' / 'descriptions' / 'architecture' for scope-limited reviews.",
      inputSchema: {
        workspaceRoot: z
          .string()
          .min(1)
          .describe("Absolute path to the workspace root."),
        reviewScope: z
          .enum(["full", "prompts", "descriptions", "architecture"])
          .optional()
          .describe("Scope of the review. Defaults to 'full'."),
      },
    },
    async ({
      workspaceRoot,
      reviewScope,
    }: {
      workspaceRoot: string;
      reviewScope?: "full" | "prompts" | "descriptions" | "architecture";
    }) => {
      const pathErr = validateAbsolutePath(workspaceRoot, "workspaceRoot");
      if (pathErr) {
        return {
          content: [{ type: "text" as const, text: pathErr }],
          isError: true as const,
        };
      }
      const snapshot = await gatherSolutionSnapshot(
        workspaceRoot,
        resolveResourcesRoot(),
      );
      const prompt = composeReviewPrompt(
        snapshot.agents,
        snapshot.knowledgeRules,
        snapshot.requirements,
        snapshot.bestPractices,
        reviewScope ?? "full",
      );
      return markdownContent(prompt);
    },
  );

  reg.registerTool(
    "cps_bundle_solution",
    {
      title: "Bundle an in-memory CPS solution for review",
      description:
        "Takes an already-unzipped CPS solution as an in-memory list of `{ path, content }` entries and returns the same markdown bundle that `cps_compose_review_prompt` derives from a workspace on disk — with the same classification rules (settings / agent config / connection references / topics / actions / knowledge), the same settings-noise stripping, and per-file plus total byte caps. Use this in hosted chat scenarios where the user uploads a ZIP: the host unzips, decodes each entry to text, calls this tool, then sends the returned `markdown` as a user message alongside the `cps_solution_reviewer` prompt persona. Files that are not recognised cloned-agent artefacts (solution.xml/botcomponents from a full solution export, binaries, ZIP metadata) are dropped — fall back to `cps_parse_solution` on disk for full solution exports.",
      inputSchema: {
        files: z
          .array(
            z.object({
              path: z
                .string()
                .min(1)
                .describe(
                  "Archive-relative path of the file (forward slashes). Leading wrapper folders are tolerated.",
                ),
              content: z
                .string()
                .describe(
                  "Decoded UTF-8 text content of the file. Filter out binaries before calling.",
                ),
            }),
          )
          .min(1)
          .describe(
            "Every file extracted from the user's CPS solution archive. Order does not matter; the tool sorts by path.",
          ),
        perFileMaxBytes: z
          .number()
          .int()
          .min(1024)
          .max(2_000_000)
          .optional()
          .describe(
            "Maximum bytes kept per file before truncation. Defaults to 200,000.",
          ),
        totalMaxBytes: z
          .number()
          .int()
          .min(10_000)
          .max(10_000_000)
          .optional()
          .describe(
            "Maximum total bytes across all included file contents. Defaults to 1,500,000.",
          ),
        header: z
          .string()
          .optional()
          .describe(
            "Section header for the bundle. Defaults to '## Solution Under Review'.",
          ),
      },
    },
    async ({
      files,
      perFileMaxBytes,
      totalMaxBytes,
      header,
    }: {
      files: Array<{ path: string; content: string }>;
      perFileMaxBytes?: number;
      totalMaxBytes?: number;
      header?: string;
    }) => {
      const result = bundleInMemorySolution(files, {
        perFileMaxBytes,
        totalMaxBytes,
        header,
      });
      return jsonContent({
        markdown: result.markdown,
        agents: result.agents.map((a) => ({
          name: a.name,
          topicCount: a.topics.length,
          actionCount: a.actions.length,
          knowledgeCount: a.knowledge.length,
        })),
        stats: result.stats,
      });
    },
  );

  // ── Build-context tools ────────────────────────────────────

  reg.registerTool(
    "cps_generate_topic_scaffolds",
    {
      title: "Generate topic scaffolds from architecture",
      description:
        "Parses architecture.md and returns a list of topic scaffolds (name, description, key behaviour, owning agent) the CPS author should create in the portal. Use this before Build phase when architecture.md has a Topics section and the agent folders do not yet contain matching topic YAMLs.",
      inputSchema: {
        architecture: z
          .string()
          .min(1)
          .describe(
            "Full markdown content of architecture.md. Pass the raw file contents — the tool parses the Topics table itself.",
          ),
      },
    },
    async ({ architecture }: { architecture: string }) => {
      const scaffolds = generateTopicScaffolds(architecture);
      return jsonContent({ topics: scaffolds });
    },
  );

  reg.registerTool(
    "cps_detect_dataverse_mcp",
    {
      title: "Detect Dataverse MCP configuration",
      description:
        "Checks whether a Dataverse MCP server is configured in .vscode/mcp.json (and optionally in extra servers provided by the caller). Returns configured=true with server name / environment URL when found. Use this before suggesting Dataverse-backed topics or tools.",
      inputSchema: {
        workspaceRoot: z
          .string()
          .min(1)
          .describe("Absolute path to the workspace root."),
        extraServers: z
          .array(
            z.object({
              name: z.string(),
              url: z.string().optional(),
            }),
          )
          .optional()
          .describe(
            "Optional MCP server entries from VS Code settings (mcp.servers). The core package cannot read VS Code settings directly; the VS Code extension passes these in.",
          ),
      },
    },
    async ({
      workspaceRoot,
      extraServers,
    }: {
      workspaceRoot: string;
      extraServers?: Array<{ name: string; url?: string }>;
    }) => {
      const pathErr = validateAbsolutePath(workspaceRoot, "workspaceRoot");
      if (pathErr) {
        return {
          content: [{ type: "text" as const, text: pathErr }],
          isError: true as const,
        };
      }
      const status = await detectDataverseMcp(workspaceRoot, extraServers);
      return jsonContent(status);
    },
  );

  // ── Prompt-config tools ────────────────────────────────────
  // Prompt tool instruction text lives in Dataverse table msdyn_aiconfiguration,
  // column msdyn_customconfiguration (a JSON blob). The Build Agent reads it
  // via the user's Dataverse MCP session, transforms it via the tools below,
  // and writes the result back through Dataverse MCP. These tools never call
  // Dataverse themselves — they are pure transformations that enforce the
  // structural-integrity rules from docs/knowledge/prompt-sync.md.

  reg.registerTool(
    "cps_parse_prompt_config",
    {
      title: "Parse a Dataverse prompt-tool configuration",
      description:
        "Parses a msdyn_customconfiguration JSON string (read from the msdyn_aiconfiguration row of a CPS prompt tool, typically via the Dataverse MCP server). Returns the prompt segments (role + content), the unique {{placeholder}} set, and the list of top-level keys present. Use this to inspect a prompt tool's instruction text before proposing edits with cps_build_prompt_update.",
      inputSchema: {
        customConfiguration: z
          .string()
          .min(1)
          .describe(
            "The full msdyn_customconfiguration value, exactly as returned by Dataverse (a JSON-encoded string). Do not pre-parse.",
          ),
      },
    },
    async ({ customConfiguration }: { customConfiguration: string }) => {
      try {
        const parsed = parsePromptConfig(customConfiguration);
        return jsonContent({
          prompts: parsed.prompts,
          placeholders: parsed.placeholders,
          topLevelKeys: parsed.keys,
          segmentCount: parsed.prompts.length,
        });
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true as const,
        };
      }
    },
  );

  reg.registerTool(
    "cps_build_prompt_update",
    {
      title: "Build a safe prompt-tool update payload",
      description:
        "Produces a new msdyn_customconfiguration JSON string with prompt-segment contents replaced. Preserves every other top-level key (code, definitions, modelParameters, settings, signature) byte-equivalently. Validates that segment count, segment roles, and the {{placeholder}} set are unchanged unless explicitly allowed. When validation fails, no payload is returned (so it cannot be PATCHed by mistake). Use this before writing back to Dataverse via the Dataverse MCP server's update-record tool.",
      inputSchema: {
        originalCustomConfiguration: z
          .string()
          .min(1)
          .describe(
            "The current msdyn_customconfiguration value, exactly as just-read from Dataverse. Re-read immediately before building the update to avoid lost-update races.",
          ),
        newPrompts: z
          .array(
            z.object({
              role: z
                .string()
                .min(1)
                .describe("Segment role (e.g. 'system', 'user')."),
              content: z
                .string()
                .describe(
                  "Segment instruction text. May contain {{placeholders}}.",
                ),
            }),
          )
          .min(1)
          .describe(
            "The full ordered set of prompt segments to write. Edit the segment contents you want to change and copy the rest unchanged from cps_parse_prompt_config output.",
          ),
        allowSegmentShapeChange: z
          .boolean()
          .optional()
          .describe(
            "Allow the segment count or segment roles to differ from the original. Defaults to false. Setting to true is rare and usually wrong — segment shape is usually fixed by the prompt tool's portal definition.",
          ),
        allowPlaceholderChange: z
          .boolean()
          .optional()
          .describe(
            "Allow the {{...}} placeholder set to differ from the original. Defaults to false. Setting to true requires a matching change to the prompt tool's input definitions in the CPS / AI Hub portal — the model cannot resolve a placeholder that has no matching input.",
          ),
      },
    },
    async ({
      originalCustomConfiguration,
      newPrompts,
      allowSegmentShapeChange,
      allowPlaceholderChange,
    }: {
      originalCustomConfiguration: string;
      newPrompts: PromptSegment[];
      allowSegmentShapeChange?: boolean;
      allowPlaceholderChange?: boolean;
    }) => {
      try {
        const result = buildPromptUpdate({
          originalCustomConfiguration,
          newPrompts,
          allowSegmentShapeChange,
          allowPlaceholderChange,
        });
        return jsonContent(result);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true as const,
        };
      }
    },
  );

  reg.registerTool(
    "cps_plan_knowledge_descriptions",
    {
      title:
        "Plan Dataverse PATCH operations for uploaded-file knowledge descriptions",
      description:
        "Reads `<agentFolder>/.mcs/conn.json` and every `<agentFolder>/knowledge/files/*.mcs.yml` mirror (including child agents under `agents/*/knowledge/files/`) and returns a plan of Dataverse Web API PATCH operations to set `botcomponent.description` for each uploaded-file knowledge source. The plan does not execute network calls; callers acquire a tenant-aligned Dataverse token and issue the GET (to resolve `botcomponentid` from `name + _parentbotid_value`) followed by the PATCH. Use this to round-trip orchestrator-routing descriptions that the official Copilot Studio extension's Apply Changes does not push back to Dataverse. Sources of truth, in priority order: (1) `cpsAgentKit.description` block at the top of the mirror YAML (recommended — survives Apply Changes), (2) `mcs.metadata.description` when it is not the auto-generated placeholder. Entries with placeholder, missing, or empty descriptions are returned with `ready: false` and an explicit `notReadyReason`.",
      inputSchema: {
        agentFolder: z
          .string()
          .min(1)
          .describe(
            "Absolute filesystem path to the cloned CPS agent folder that contains `.mcs/conn.json` and `knowledge/files/`.",
          ),
      },
    },
    async ({ agentFolder }: { agentFolder: string }) => {
      const pathErr = validateAbsolutePath(agentFolder, "agentFolder");
      if (pathErr) {
        return {
          content: [{ type: "text" as const, text: pathErr }],
          isError: true as const,
        };
      }
      try {
        const plan = await planKnowledgeDescriptions(agentFolder);
        return jsonContent(plan);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true as const,
        };
      }
    },
  );

  // ── Prompts ────────────────────────────────────────────────
  // Exposed via MCP `prompts` capability so any host can adopt the
  // Agent Workbench Docs Q&A Agent persona without copy/pasting markdown.

  innerReg.registerPrompt(
    "cps_docs_qa_agent",
    {
      title: "Agent Workbench Docs Q&A Agent",
      description:
        "System prompt for a standalone Q&A agent that answers questions about Microsoft Copilot Studio using the Agent Workbench knowledge and best-practice docs. Pair with the cps_search_docs, cps_list_knowledge_topics, cps_get_knowledge, and cps_get_best_practice tools; do not enable the parse/assess tools.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: DOCS_QA_AGENT_SYSTEM_PROMPT,
          },
        },
      ],
    }),
  );

  innerReg.registerPrompt(
    "cps_spec_planner",
    {
      title: "CPS Spec & Architecture Planner",
      description:
        "Paste-mode system prompt for an assistant that turns a developer's plain-language requirements into `Requirements/spec.md` and `Requirements/architecture.md` content, grounded in the CPSAgentKit knowledge base. Pair with `cps_search_docs`, `cps_get_knowledge`, and `cps_get_best_practice` so the model can cite platform constraints. The persona is workspace-agnostic: the user pastes requirements into chat.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: SPEC_PLANNER_SYSTEM_PROMPT,
          },
        },
      ],
    }),
  );

  innerReg.registerPrompt(
    "cps_solution_reviewer",
    {
      title: "CPS Solution Reviewer (paste mode)",
      description:
        "Paste-mode system prompt for the CPSAgentKit solution reviewer persona. The prompt deliberately does not embed a solution bundle — hosted chat clients call `cps_bundle_solution` separately and send the resulting markdown as a user message. Optional `scope` argument narrows the review focus (full / prompts / descriptions / architecture) to match the existing filesystem workflow.",
      argsSchema: {
        scope: z
          .string()
          .optional()
          .describe(
            "Review scope: one of 'full', 'prompts', 'descriptions', 'architecture'. Defaults to 'full'.",
          ),
      },
    },
    (args: { scope?: string }) => {
      const allowed: SolutionReviewerScope[] = [
        "full",
        "prompts",
        "descriptions",
        "architecture",
      ];
      const raw = (args?.scope ?? "full").toLowerCase();
      const scope = (allowed as string[]).includes(raw)
        ? (raw as SolutionReviewerScope)
        : "full";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildSolutionReviewerSystemPrompt(scope),
            },
          },
        ],
      };
    },
  );

  // ── Resources ──────────────────────────────────────────────
  // Expose every document as a browsable MCP resource so clients with
  // resource UIs (Claude Desktop) can render them without calling a tool.

  for (const topic of store.list()) {
    const uri = `agent-workbench://${topic.category}/${topic.slug}`;
    const legacyUri = `cpsagentkit://${topic.category}/${topic.slug}`;
    const resourceConfig = {
      title: topic.title,
      description: `Copilot Studio ${topic.category} document: ${topic.title}`,
      mimeType: "text/markdown",
    };
    const resourceHandler = async () => {
      const doc = store.get(topic.slug);
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: doc?.content ?? "",
          },
        ],
      };
    };
    reg.registerResource(
      `${topic.category}-${topic.slug}`,
      uri,
      resourceConfig,
      resourceHandler,
    );
    // Legacy `cpsagentkit://` scheme alias for one release.
    reg.registerResource(
      `legacy-${topic.category}-${topic.slug}`,
      legacyUri,
      resourceConfig,
      resourceHandler,
    );
  }

  return server;
}
