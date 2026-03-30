import * as fs from "fs/promises";
import * as path from "path";

interface GuidanceSource {
  label: string;
  relativePath: string;
}

const GUIDANCE_SOURCES: GuidanceSource[] = [
  {
    label: "Platform Constraints",
    relativePath: "docs/knowledge/constraints.md",
  },
  {
    label: "Prompt Engineering",
    relativePath: "docs/knowledge/prompt-engineering.md",
  },
  {
    label: "Tool Descriptions",
    relativePath: "docs/knowledge/tool-descriptions.md",
  },
  {
    label: "Anti-Patterns",
    relativePath: "docs/knowledge/anti-patterns.md",
  },
  {
    label: "Knowledge Sources",
    relativePath: "docs/knowledge/knowledge-sources.md",
  },
  {
    label: "Agent Design Best Practices",
    relativePath: "docs/bestpractices/part3-agent-design.md",
  },
  {
    label: "Tools and Multi-Agent Best Practices",
    relativePath: "docs/bestpractices/part4-tools-multiagent.md",
  },
];

const WORKING_RULES = [
  "Treat the bundled CPS guidance as the authoritative design standard for this repo; do not replace it with unstated generic Copilot Studio assumptions.",
  "Normalize requirements into a CPS-compliant design: prefer the smallest viable agent shape, explicit scope boundaries, tool-first instructions, and exact tool descriptions.",
  "Do not preserve invalid designs. Rewrite architectures that violate known constraints such as child-owned triggers, child-agent MCP dependence through parent orchestration, weak tool descriptions, or over-granular Dataverse CRUD scaffolding.",
  "When requirements are underspecified, record the gap as TBD plus the missing decision instead of inventing unsupported CPS behavior.",
  "Carry repo best practices into the output explicitly: platform constraints, knowledge-source limits, identity/governance implications, and pre-build portal-only steps must be visible in the generated documents.",
];

function extractEvidenceSnippet(content: string, maxLines = 8): string[] {
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
        return {
          ...source,
          snippet: extractEvidenceSnippet(content),
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
