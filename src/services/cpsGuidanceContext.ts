import * as fs from "fs/promises";
import * as path from "path";

interface GuidanceSource {
  label: string;
  relativePath: string;
  /** Higher priority sources get more evidence lines in the pack */
  priority: "high" | "normal";
}

const GUIDANCE_SOURCES: GuidanceSource[] = [
  {
    label: "Platform Constraints",
    relativePath: "docs/knowledge/constraints.md",
    priority: "high",
  },
  {
    label: "Prompt Engineering",
    relativePath: "docs/knowledge/prompt-engineering.md",
    priority: "high",
  },
  {
    label: "Tool Descriptions",
    relativePath: "docs/knowledge/tool-descriptions.md",
    priority: "high",
  },
  {
    label: "Anti-Patterns",
    relativePath: "docs/knowledge/anti-patterns.md",
    priority: "high",
  },
  {
    label: "Knowledge Sources",
    relativePath: "docs/knowledge/knowledge-sources.md",
    priority: "high",
  },
  {
    label: "Multi-Agent Patterns",
    relativePath: "docs/knowledge/multi-agent-patterns.md",
    priority: "high",
  },
  {
    label: "Platform Quotas and Limits",
    relativePath: "docs/bestpractices/part1-platform.md",
    priority: "normal",
  },
  {
    label: "ALM Governance and Security",
    relativePath: "docs/bestpractices/part2-alm-governance-security.md",
    priority: "normal",
  },
  {
    label: "Agent Design Best Practices",
    relativePath: "docs/bestpractices/part3-agent-design.md",
    priority: "high",
  },
  {
    label: "Tools and Multi-Agent Best Practices",
    relativePath: "docs/bestpractices/part4-tools-multiagent.md",
    priority: "high",
  },
  {
    label: "Gotchas and Known Issues",
    relativePath: "docs/bestpractices/part5-gotchas-bugs.md",
    priority: "normal",
  },
  {
    label: "Troubleshooting",
    relativePath: "docs/knowledge/troubleshooting.md",
    priority: "normal",
  },
];

const WORKING_RULES = [
  "Treat the bundled CPS guidance as the authoritative design standard for this repo; do not replace it with unstated generic Copilot Studio assumptions.",
  "Normalize requirements into a CPS-compliant design: prefer the smallest viable agent shape, explicit scope boundaries, tool-first instructions, and exact tool descriptions.",
  "Do not preserve invalid designs. Rewrite architectures that violate known constraints such as child-owned triggers, child-agent MCP dependence through parent orchestration, weak tool descriptions, or over-granular Dataverse CRUD scaffolding.",
  "When requirements are underspecified, record the gap as TBD plus the missing decision instead of inventing unsupported CPS behavior.",
  "Carry repo best practices into the output explicitly: platform constraints, knowledge-source limits, identity/governance implications, and pre-build portal-only steps must be visible in the generated documents.",
  "Prefer a shared Dataverse CRUD scaffold (one read, one write, one delete per agent) rather than one connector or action per business function or table, unless the data model genuinely requires specialization.",
  "MCP tools must be owned by the parent agent. Child agents cannot reliably invoke MCP tools through parent orchestration.",
  "Power Automate flows run as the author by default. Flag explicit identity and governance decisions for any flow-based tool, especially approvals.",
  "Knowledge sources must respect CPS retrieval constraints: 7 MB SharePoint file limit without M365 Copilot license, 4-6 hour sync, zero chunking control, and description-driven filtering beyond 25 sources.",
  "Content moderation is portal-only (no YAML surface). Always include it as a manual portal step when the domain may need a non-default setting.",
  "Multi-agent decomposition is only justified when tool count exceeds 25-30 per agent, governance boundaries differ, or teams independently own different domains. Do not over-engineer.",
  "If a customer requirement implies a CPS-risky pattern, state the constraint and propose the compliant alternative instead of silently carrying the risk forward.",
  "Prompt tools are preferable to child agents for single-purpose AI calls, format enforcement, temperature control, or code interpreter access.",
  "Settings coherence matters: useModelKnowledge, webBrowsing, isSemanticSearchEnabled, and isFileAnalysisEnabled must all match the architecture intent. Portal defaults are aggressive — validate each.",
];

function extractEvidenceSnippet(content: string, maxLines = 16): string[] {
  const rawLines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("<!--"));

  const priorityLines = rawLines.filter(
    (line) =>
      line.startsWith("- ") ||
      /^\d+\./.test(line) ||
      line.startsWith("## ") ||
      line.startsWith("### "),
  );

  const selected: string[] = [];
  for (const line of priorityLines) {
    if (selected.length >= maxLines) {
      break;
    }
    if (!selected.includes(line)) {
      selected.push(line);
    }
  }

  if (selected.length < maxLines) {
    for (const line of rawLines) {
      if (selected.length >= maxLines) {
        break;
      }
      if (!selected.includes(line) && !line.startsWith("# ")) {
        selected.push(line);
      }
    }
  }

  return selected.slice(0, maxLines);
}

export async function buildCpsGuidancePack(): Promise<string> {
  const repoRoot = path.dirname(path.dirname(__dirname));
  const loadedSources = await Promise.all(
    GUIDANCE_SOURCES.map(async (source) => {
      const filePath = path.join(repoRoot, source.relativePath);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const maxLines = source.priority === "high" ? 24 : 12;
        return {
          ...source,
          snippet: extractEvidenceSnippet(content, maxLines),
        };
      } catch {
        return undefined;
      }
    }),
  );

  const availableSources = loadedSources.filter(
    (source): source is GuidanceSource & { snippet: string[] } =>
      Boolean(source),
  );

  const lines: string[] = [
    "## CPS Guidance Pack",
    "",
    "Use the local CPS documentation below as the authoritative standard for design decisions in this repo.",
    "Do not substitute unstated generic Copilot Studio knowledge when these sources cover the decision.",
    "",
    "### Source Documents",
    "",
  ];

  if (availableSources.length > 0) {
    for (const source of availableSources) {
      lines.push(`- ${source.label} (${source.relativePath})`);
    }
  } else {
    lines.push(
      "- No bundled guidance documents were available at generation time.",
    );
  }

  lines.push("", "### Working Rules", "");
  for (const rule of WORKING_RULES) {
    lines.push(`- ${rule}`);
  }

  if (availableSources.length > 0) {
    lines.push("", "### Evidence Excerpts", "");
    for (const source of availableSources) {
      lines.push(`#### ${source.label}`, "");
      for (const line of source.snippet) {
        lines.push(`- ${line}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
