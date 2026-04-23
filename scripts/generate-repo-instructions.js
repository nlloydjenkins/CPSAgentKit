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

  // List reference architecture template directories
  const templatesDir = path.join(root, "docs", "templates");
  let templateDirNames = [];
  try {
    const tplEntries = await fs.readdir(templatesDir, { withFileTypes: true });
    templateDirNames = tplEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    // Templates directory doesn't exist
  }

  const knowledgeFileList = knowledgeFiles.map(
    ({ filename }) => `- \`docs/knowledge/${filename}\``,
  );
  const bestPracticeFileList = bestPracticeFiles.map(
    ({ filename }) => `- \`docs/bestpractices/${filename}\``,
  );
  const templateDirList = templateDirNames.map(
    (name) => `- \`docs/templates/${name}/\``,
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
  ];

  if (knowledgeFileList.length > 0) {
    parts.push(
      "",
      "---",
      "",
      "## Available Knowledge Files",
      "",
      "Read these files when you need detailed platform knowledge for design, build, or troubleshooting decisions:",
      "",
      ...knowledgeFileList,
    );
  }

  if (bestPracticeFileList.length > 0) {
    parts.push(
      "",
      "## Available Best Practice Files",
      "",
      "Read these files when designing, building, or reviewing agents:",
      "",
      ...bestPracticeFileList,
    );
  }

  if (templateDirList.length > 0) {
    parts.push(
      "",
      "## Available Reference Architecture Templates",
      "",
      "Read these directories for proven multi-agent designs and working examples when proposing architectures:",
      "",
      ...templateDirList,
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
