import * as fs from "fs/promises";
import * as path from "path";
import { fileExists } from "./fileUtils.js";
import type { AgentSnapshot } from "./solutionReviewer.js";

/** Metadata extracted from solution.xml */
export interface SolutionMetadata {
  uniqueName: string;
  displayName: string;
  version: string;
  publisher: string;
}

/** A bot component (topic) from the exported solution */
interface BotComponent {
  schemaName: string;
  name: string;
  description: string;
  stateCode: string;
  statusCode: string;
  data: string;
}

/**
 * Detect whether a folder is an exported CPS solution
 * (has solution.xml and a botcomponents/ directory).
 */
export async function isSolutionFileFolder(
  folderPath: string,
): Promise<boolean> {
  const hasSolutionXml = await fileExists(path.join(folderPath, "solution.xml"));
  const hasBotComponents = await fileExists(
    path.join(folderPath, "botcomponents"),
  );
  return hasSolutionXml && hasBotComponents;
}

/**
 * Scan a directory for exported CPS solution folders (non-recursive, checks
 * immediate children only).  Returns absolute paths of matching folders,
 * sorted alphabetically.
 */
export async function findSolutionFolders(
  baseDir: string,
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      const candidate = path.join(baseDir, entry.name);
      if (await isSolutionFileFolder(candidate)) {
        results.push(candidate);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return results.sort();
}

/** Extract basic metadata from solution.xml using simple regex parsing */
export async function parseSolutionMetadata(
  folderPath: string,
): Promise<SolutionMetadata> {
  const xml = await fs.readFile(
    path.join(folderPath, "solution.xml"),
    "utf-8",
  );

  const uniqueName =
    xml.match(/<UniqueName>(.*?)<\/UniqueName>/)?.[1] ?? "Unknown";
  const displayName =
    xml.match(
      /<LocalizedNames>\s*<LocalizedName\s+description="([^"]*?)"/,
    )?.[1] ?? uniqueName;
  const version = xml.match(/<Version>(.*?)<\/Version>/)?.[1] ?? "0.0.0.0";
  const publisher =
    xml.match(
      /<Publisher>\s*<UniqueName>(.*?)<\/UniqueName>/s,
    )?.[1] ?? "Unknown";

  return { uniqueName, displayName, version, publisher };
}

/** Discover bot folders under bots/ and read bot.xml + configuration.json */
async function readBots(
  folderPath: string,
): Promise<
  Array<{ name: string; schemaName: string; botXml: string; config: string }>
> {
  const botsDir = path.join(folderPath, "bots");
  const bots: Array<{
    name: string;
    schemaName: string;
    botXml: string;
    config: string;
  }> = [];

  try {
    const entries = await fs.readdir(botsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const botDir = path.join(botsDir, entry.name);
      let botXml = "";
      let config = "";

      try {
        botXml = await fs.readFile(path.join(botDir, "bot.xml"), "utf-8");
      } catch {
        /* no bot.xml */
      }
      try {
        config = await fs.readFile(
          path.join(botDir, "configuration.json"),
          "utf-8",
        );
      } catch {
        /* no configuration.json */
      }

      // Extract the bot name from bot.xml
      const nameMatch = botXml.match(/<name>(.*?)<\/name>/);
      const name = nameMatch?.[1] ?? entry.name;

      bots.push({ name, schemaName: entry.name, botXml, config });
    }
  } catch {
    /* no bots directory */
  }

  return bots;
}

/** Read a single botcomponent folder (topic) */
async function readBotComponent(
  componentDir: string,
): Promise<BotComponent | null> {
  let xmlContent = "";
  try {
    xmlContent = await fs.readFile(
      path.join(componentDir, "botcomponent.xml"),
      "utf-8",
    );
  } catch {
    return null;
  }

  const schemaName =
    xmlContent.match(/<botcomponent\s+schemaname="([^"]*?)"/)?.[1] ?? "";
  const name = xmlContent.match(/<name>(.*?)<\/name>/)?.[1] ?? schemaName;
  const description =
    xmlContent.match(/<description>(.*?)<\/description>/)?.[1] ?? "";
  const stateCode =
    xmlContent.match(/<statecode>(.*?)<\/statecode>/)?.[1] ?? "";
  const statusCode =
    xmlContent.match(/<statuscode>(.*?)<\/statuscode>/)?.[1] ?? "";

  // Read the YAML data file
  let data = "";
  const dataPath = path.join(componentDir, "data");
  try {
    const stat = await fs.stat(dataPath);
    if (stat.isFile()) {
      data = await fs.readFile(dataPath, "utf-8");
    }
  } catch {
    /* no data file */
  }

  return { schemaName, name, description, stateCode, statusCode, data };
}

/** Read all botcomponents for a given bot schema name */
async function readBotComponents(
  folderPath: string,
  botSchemaName: string,
): Promise<BotComponent[]> {
  const componentsDir = path.join(folderPath, "botcomponents");

  try {
    const entries = await fs.readdir(componentsDir, { withFileTypes: true });
    const botPrefix = botSchemaName + ".topic.";

    const results = await Promise.all(
      entries
        .filter((e) => e.isDirectory() && e.name.startsWith(botPrefix))
        .map((e) => readBotComponent(path.join(componentsDir, e.name))),
    );

    return results
      .filter((c): c is BotComponent => c !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    /* no botcomponents directory */
    return [];
  }
}

/** Read Power Automate cloud flow definitions from Workflows/ */
async function readWorkflows(
  folderPath: string,
): Promise<Array<{ filename: string; content: string }>> {
  const workflowsDir = path.join(folderPath, "Workflows");

  try {
    const entries = await fs.readdir(workflowsDir);
    const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
    return await Promise.all(
      jsonFiles.map(async (filename) => ({
        filename,
        content: await fs.readFile(
          path.join(workflowsDir, filename),
          "utf-8",
        ),
      })),
    );
  } catch {
    /* no Workflows directory */
    return [];
  }
}

/** Read environment variable definitions */
async function readEnvironmentVariables(
  folderPath: string,
): Promise<Array<{ name: string; xml: string }>> {
  const envDir = path.join(folderPath, "environmentvariabledefinitions");

  try {
    const entries = await fs.readdir(envDir, { withFileTypes: true });
    const results = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (entry) => {
          try {
            const xml = await fs.readFile(
              path.join(envDir, entry.name, "environmentvariabledefinition.xml"),
              "utf-8",
            );
            return { name: entry.name, xml };
          } catch {
            return null;
          }
        }),
    );
    return results
      .filter((v): v is { name: string; xml: string } => v !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    /* no environmentvariabledefinitions directory */
    return [];
  }
}

/**
 * Parse an exported CPS solution folder into AgentSnapshot(s)
 * compatible with the existing review prompt composer.
 */
export async function parseSolutionFile(
  folderPath: string,
): Promise<AgentSnapshot[]> {
  // Read bots, workflows, and env vars in parallel
  const [bots, workflows, envVars] = await Promise.all([
    readBots(folderPath),
    readWorkflows(folderPath),
    readEnvironmentVariables(folderPath),
  ]);

  // Read all bot components in parallel across bots
  const agents: AgentSnapshot[] = await Promise.all(
    bots.map(async (bot) => {
      const components = await readBotComponents(folderPath, bot.schemaName);

    // Map bot.xml → settings
    const settings = bot.botXml;

    // Map configuration.json → agentConfig
    const agentConfig = bot.config;

    // Build topics array from botcomponents
    // Include both the XML metadata and the YAML data
    const topics: Array<{ filename: string; content: string }> = [];
    for (const comp of components) {
      // Build a combined view: metadata header + YAML data
      const metadataLines: string[] = [
        `# Topic: ${comp.name}`,
        `# Schema: ${comp.schemaName}`,
      ];
      if (comp.description) {
        metadataLines.push(`# Description: ${comp.description}`);
      }
      metadataLines.push(
        `# State: ${comp.stateCode === "0" ? "Active" : "Inactive"} (statecode=${comp.stateCode}, statuscode=${comp.statusCode})`,
      );

      const content = comp.data
        ? metadataLines.join("\n") + "\n---\n" + comp.data
        : metadataLines.join("\n") + "\n# (no dialog data)";

      topics.push({ filename: comp.name, content });
    }

      // Map Workflows -> actions
      const actions = workflows;

      // Build environment variables as a knowledge-like entry
      const knowledge: Array<{ filename: string; content: string }> = [];
      if (envVars.length > 0) {
        const envSummary = envVars
          .map((v) => `- ${v.name}\n${v.xml}`)
          .join("\n\n");
        knowledge.push({
          filename: "environment-variables.xml",
          content: envSummary,
        });
      }

      return {
        name: bot.name,
        settings,
        agentConfig,
        connectionReferences: "",
        topics,
        actions,
        knowledge,
      } as AgentSnapshot;
    }),
  );

  return agents;
}
