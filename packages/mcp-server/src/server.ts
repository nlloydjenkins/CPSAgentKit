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
  gatherSolutionSnapshot,
  detectPreBuildState,
  composePreBuildReport,
  detectDataverseMcp,
  readRequirements,
  generateTopicScaffolds,
} from "@cpsagentkit/core";

import { MCP_SERVER_VERSION } from "./index.js";

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

/**
 * Build and return an MCP server with the M3 toolset registered.
 * Transport wiring happens in `bin.ts`.
 */
export async function createServer(): Promise<McpServer> {
  const store = await initKnowledgeStore();

  const server = new McpServer({
    name: "cpsagentkit-mcp",
    version: MCP_SERVER_VERSION,
  });

  // Cast once: the SDK's `registerTool` generics resolve `ZodRawShape` against
  // zod's recursive types, which TypeScript can't instantiate (TS2589) when
  // multiple zod versions coexist in the graph. Registration is runtime-safe;
  // we preserve type safety inside each handler by annotating parameters.
  const reg = server as unknown as {
    registerTool: (
      name: string,
      config: {
        title?: string;
        description?: string;
        inputSchema?: Record<string, z.ZodTypeAny>;
      },
      handler: (args: any) => Promise<unknown> | unknown,
    ) => void;
    registerResource: (
      name: string,
      uri: string,
      config: { title?: string; description?: string; mimeType?: string },
      handler: (uri: URL) => Promise<unknown> | unknown,
    ) => void;
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

  // ── Parsing & assessment tools ─────────────────────────────

  reg.registerTool(
    "cps_detect_project_state",
    {
      title: "Detect CPS project state",
      description:
        "Returns a structured snapshot of a workspace: whether CPSAgentKit is initialised, whether spec/architecture exist, whether knowledge is synced, whether best-practice docs are present, and the list of detected CPS agent folders. Use this to decide which phase (Define / Architect / Build / Test) the workspace is in before invoking other tools.",
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
        description: z
          .string()
          .describe("The description text to validate."),
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

  // ── Build-context tools ────────────────────────────────────

  reg.registerTool(
    "cps_detect_prebuild_state",
    {
      title: "Detect pre-build state for a CPS workspace",
      description:
        "Scans cloned CPS agent folders against the architecture.md expectations and returns structured gaps: which expected agents/topics/tools are missing, which settings flags disagree with the architecture, and which knowledge sources are unconfigured. Use before Build phase to decide what still needs creating in the CPS portal.",
      inputSchema: {
        workspaceRoot: z
          .string()
          .min(1)
          .describe("Absolute path to the workspace root."),
      },
    },
    async ({ workspaceRoot }: { workspaceRoot: string }) => {
      const { architecture } = await readRequirements(workspaceRoot);
      if (!architecture) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No architecture.md found. Run the Architect phase first.",
            },
          ],
          isError: true as const,
        };
      }
      const state = await detectPreBuildState(workspaceRoot, architecture);
      return jsonContent(state);
    },
  );

  reg.registerTool(
    "cps_compose_prebuild_report",
    {
      title: "Compose a pre-build report for a CPS workspace",
      description:
        "Returns a markdown pre-build report that lists portal-side setup steps (agent creation, topic scaffolding, tool wiring, knowledge sources, settings flags) derived from spec.md + architecture.md and compared against the current cloned state. Call this after cps_detect_prebuild_state when the user wants a human-readable checklist.",
      inputSchema: {
        workspaceRoot: z
          .string()
          .min(1)
          .describe("Absolute path to the workspace root."),
      },
    },
    async ({ workspaceRoot }: { workspaceRoot: string }) => {
      const { spec, architecture, docs } = await readRequirements(workspaceRoot);
      if (!architecture) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No architecture.md found. Run the Architect phase first.",
            },
          ],
          isError: true as const,
        };
      }
      const state = await detectPreBuildState(workspaceRoot, architecture);
      const report = composePreBuildReport(spec, architecture, docs, state);
      return markdownContent(report);
    },
  );

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
      const status = await detectDataverseMcp(workspaceRoot, extraServers);
      return jsonContent(status);
    },
  );

  // ── Resources ──────────────────────────────────────────────
  // Expose every document as a browsable MCP resource so clients with
  // resource UIs (Claude Desktop) can render them without calling a tool.

  for (const topic of store.list()) {
    const uri = `cpsagentkit://${topic.category}/${topic.slug}`;
    reg.registerResource(
      `${topic.category}-${topic.slug}`,
      uri,
      {
        title: topic.title,
        description: `CPS ${topic.category} document: ${topic.title}`,
        mimeType: "text/markdown",
      },
      async () => {
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
      },
    );
  }

  return server;
}
