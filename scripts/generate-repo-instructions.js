const fs = require("fs/promises");
const path = require("path");

async function readMarkdownFiles(dir) {
  try {
    const entries = (await fs.readdir(dir))
      .filter((name) => name.endsWith(".md"))
      .sort();
    return Promise.all(
      entries.map(async (filename) => ({
        filename,
        content: await fs.readFile(path.join(dir, filename), "utf8"),
      })),
    );
  } catch {
    return [];
  }
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const templatePath = path.join(
    root,
    "templates",
    "copilot-instructions-template.md",
  );
  const outputPath = path.join(root, ".github", "copilot-instructions.md");

  const template = await fs.readFile(templatePath, "utf8");
  const knowledgeFiles = await readMarkdownFiles(
    path.join(root, "docs", "knowledge"),
  );
  const bestPracticeFiles = await readMarkdownFiles(
    path.join(root, "docs", "bestpractices"),
  );

  const knowledgeSections = knowledgeFiles.map(({ filename, content }) => {
    const sectionName = filename.replace(/\.md$/, "").replace(/-/g, " ");
    return `<!-- Knowledge: ${sectionName} -->\n${content}`;
  });

  const bestPracticeSections = bestPracticeFiles.map(
    ({ filename, content }) => {
      const sectionName = filename.replace(/\.md$/, "").replace(/-/g, " ");
      return `<!-- Best Practice: ${sectionName} -->\n${content}`;
    },
  );

  const projectStateSection = [
    "## Current Project State",
    "",
    "- **Current phase:** Extension development / knowledge authoring",
    "- **Knowledge source mode:** Source docs under `docs/knowledge/`",
    "- **Best practices source mode:** Source docs under `docs/bestpractices/`",
    "- **Generated file purpose:** Repo-level Copilot context for maintaining CPSAgentKit itself",
    "",
    "**Next step:** Keep source docs authoritative. Regenerate this file after knowledge or best-practice updates so Copilot sees the latest reference library.",
  ].join("\n");

  const parts = [
    "<!-- AUTO-GENERATED for CPSAgentKit repo maintenance. Regenerate after source knowledge changes. -->",
    "",
    template,
    "",
    "---",
    "",
    "# CPS Platform Knowledge Reference",
    "",
    "The following sections contain the CPS platform knowledge base used to maintain this repository. Reference these when changing prompts, review logic, architecture guidance, or build automation.",
    "",
    ...knowledgeSections.map((section) => `\n${section}`),
  ];

  if (bestPracticeSections.length > 0) {
    parts.push(
      "",
      "---",
      "",
      "# CPS Best Practices",
      "",
      "The following sections contain best practice guidance for Copilot Studio solutions. Apply these when designing, building, and reviewing agents.",
      "",
      ...bestPracticeSections.map((section) => `\n${section}`),
    );
  }

  parts.push("", "---", "", projectStateSection, "");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, parts.join("\n"), "utf8");

  process.stdout.write(`Wrote ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
