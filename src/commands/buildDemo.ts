import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import {
  requireWorkspaceRoot,
  openPromptInCopilotChat,
} from "../ui/uiUtils.js";

/**
 * Recursively copy a directory, creating target dirs as needed.
 * Does NOT overwrite existing files.
 */
async function copyDirNonDestructive(
  src: string,
  dest: string,
): Promise<number> {
  await fs.mkdir(dest, { recursive: true });
  let count = 0;
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDirNonDestructive(srcPath, destPath);
    } else {
      try {
        await fs.access(destPath);
        // File already exists — skip
      } catch {
        await fs.copyFile(srcPath, destPath);
        count++;
      }
    }
  }
  return count;
}

/** Build Demo command — scaffolds demo files and opens a guided walkthrough in Copilot Chat */
export async function buildDemoCommand(extensionPath: string): Promise<void> {
  const root = requireWorkspaceRoot();
  if (!root) {
    return;
  }

  const demoSrc = path.join(extensionPath, "demo", "it-help-desk");

  // Verify the demo directory exists in the extension bundle
  try {
    await fs.access(demoSrc);
  } catch {
    vscode.window.showErrorMessage(
      "CPSAgentKit: Demo files not found in extension bundle. Reinstall the extension.",
    );
    return;
  }

  // Copy demo files into the workspace
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CPSAgentKit: Setting up IT Help Desk demo...",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Copying requirement docs..." });
      const reqCount = await copyDirNonDestructive(
        path.join(demoSrc, "Requirements"),
        path.join(root, "Requirements"),
      );

      progress.report({ message: "Copying sample data..." });
      const sampleCount = await copyDirNonDestructive(
        path.join(demoSrc, "sample-data"),
        path.join(root, "sample-data"),
      );

      vscode.window.showInformationMessage(
        `CPSAgentKit: Demo files copied (${reqCount + sampleCount} files). Opening walkthrough...`,
      );
    },
  );

  // Set up .vscode/mcp.json for the Dataverse MCP Server
  await ensureDataverseMcpConfig(root);

  // Read the seed data and knowledge article list so the prompt can reference them
  const knowledgeDir = path.join(root, "sample-data", "knowledge-articles");
  let knowledgeArticles: string[] = [];
  try {
    const entries = await fs.readdir(knowledgeDir);
    knowledgeArticles = entries.filter((e) => e.endsWith(".md")).sort();
  } catch {
    // Ignore — prompt will still work
  }

  let seedData = "";
  try {
    seedData = await fs.readFile(
      path.join(root, "sample-data", "dataverse-seed-data.md"),
      "utf-8",
    );
  } catch {
    // Ignore
  }

  const prompt = composeDemoWalkthrough(knowledgeArticles, seedData);
  await openPromptInCopilotChat(prompt);

  vscode.window.showInformationMessage(
    "CPSAgentKit: Demo walkthrough loaded into Copilot Chat — press Enter to start.",
  );
}

/** Create or update .vscode/mcp.json with the Dataverse MCP Server entry */
async function ensureDataverseMcpConfig(root: string): Promise<void> {
  const mcpPath = path.join(root, ".vscode", "mcp.json");

  // Check if mcp.json already has a Dataverse entry
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(mcpPath, "utf-8");
    existing = JSON.parse(raw) as Record<string, unknown>;
    const servers = existing.servers as Record<string, unknown> | undefined;
    if (servers && "DataverseMcp" in servers) {
      // Already configured — skip
      return;
    }
  } catch {
    // File doesn't exist or is invalid — we'll create it
  }

  const instanceUrl = await vscode.window.showInputBox({
    title: "Dataverse MCP Server",
    prompt:
      "Enter your Dataverse instance URL (e.g. https://org1a2b3c4d.crm11.dynamics.com)",
    placeHolder: "https://org1a2b3c4d.crm11.dynamics.com",
    validateInput: (value) => {
      if (!value) {
        return "Instance URL is required for the demo";
      }
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") {
          return "URL must use https://";
        }
        if (!url.hostname.includes(".dynamics.com")) {
          return "Expected a Dynamics 365 instance URL (*.dynamics.com)";
        }
      } catch {
        return "Please enter a valid URL";
      }
      return undefined;
    },
  });

  if (!instanceUrl) {
    vscode.window.showWarningMessage(
      "CPSAgentKit: Skipped Dataverse MCP setup. You can add it manually to .vscode/mcp.json later.",
    );
    return;
  }

  // Normalise: strip trailing slash, append /api/mcp
  const baseUrl = instanceUrl.replace(/\/+$/, "");
  const mcpUrl = `${baseUrl}/api/mcp`;

  // Merge with any existing config
  const servers = (existing.servers as Record<string, unknown>) ?? {};
  servers["DataverseMcp"] = {
    type: "http",
    url: mcpUrl,
  };
  servers["CLI for Microsoft 365 MCP Server"] = {
    type: "stdio",
    command: "npx",
    args: ["-y", "@pnp/cli-microsoft365-mcp-server@latest"],
  };
  existing.servers = servers;

  await fs.mkdir(path.join(root, ".vscode"), { recursive: true });
  await fs.writeFile(
    mcpPath,
    JSON.stringify(existing, null, 2) + "\n",
    "utf-8",
  );

  vscode.window.showInformationMessage(
    `CPSAgentKit: Dataverse MCP Server configured → ${mcpUrl}. PnP CLI for Microsoft 365 MCP Server also added.`,
  );
}

/** Compose the guided walkthrough prompt */
function composeDemoWalkthrough(
  knowledgeArticles: string[],
  seedData: string,
): string {
  const articleList =
    knowledgeArticles.length > 0
      ? knowledgeArticles.map((a) => `  - ${a}`).join("\n")
      : "  (no articles found — check sample-data/knowledge-articles/)";

  const sections = [
    `You are guiding the user through building the IT Help Desk demo — a multi-agent Copilot Studio solution. Walk them through each step below one at a time. After each step, wait for the user to confirm they've completed it before moving to the next.`,
    "",
    `Do NOT perform these steps yourself. Describe exactly what the user needs to do in the Copilot Studio portal, in VS Code, or in the command palette. Be specific with setting names, button locations, and exact values to enter.`,
    "",
    "---",
    "",
    "## Step 1: Verify Prerequisites",
    "",
    "Tell the user to ensure:",
    "1. The CLI for Microsoft 365 is installed globally: `npm i -g @pnp/cli-microsoft365`",
    "2. The Dataverse MCP Server is enabled on their managed environment (Settings → Product → Features → Dataverse Model Context Protocol)",
    "3. The `.vscode/mcp.json` file was created by this command — it contains both the **Dataverse MCP Server** and the **CLI for Microsoft 365 MCP Server**",
    "4. Open `.vscode/mcp.json` and click **Start** above the **DataverseMcp** entry to connect and authenticate",
    "",
    "---",
    "",
    "## Step 2: Create the IT Department Team",
    "",
    "Tell the user to:",
    "1. Authenticate the CLI for Microsoft 365 if not already done: open a terminal and run `m365 login`",
    "2. Open `.vscode/mcp.json` and click **Start** above the **CLI for Microsoft 365 MCP Server** entry to connect it",
    "3. In GitHub Copilot Chat (Agent mode), send: **\"Using CLI for Microsoft 365, create a new Team called 'IT Department' and add a channel called 'Support Requests'\"**",
    "4. Approve the tool calls when prompted",
    "5. Verify the team and channel appear in Microsoft Teams",
    "",
    "This creates the channel that the Notification Specialist agent will post to for High/Critical tickets.",
    "",
    "---",
    "",
    "## Step 3: Initialise the Project",
    "",
    "Tell the user to:",
    "1. Open the VS Code Command Palette (Cmd+Shift+P / Ctrl+Shift+P)",
    "2. Run **CPSAgentKit: Initialise CPS Project**",
    "3. Wait for the knowledge sync to complete",
    "",
    "This creates the `.cpsagentkit/` folder, syncs platform knowledge, and generates `.github/copilot-instructions.md`.",
    "",
    "---",
    "",
    "## Step 4: Generate Spec and Architecture",
    "",
    "Tell the user to:",
    "1. Open the Command Palette",
    "2. Run **CPSAgentKit: Create Specification**",
    '3. Select **"Generate from requirements docs"**',
    "4. Press Enter in Copilot Chat when the runner instruction appears",
    "5. Wait for Copilot to generate both `Requirements/spec.md` and `Requirements/architecture.md`",
    "6. Briefly review the generated files — they should show:",
    "   - A parent orchestrator (IT Help Desk) owning the Dataverse MCP Server and Office 365 Users connector",
    "   - A Knowledge Specialist child agent with SharePoint knowledge",
    "   - A Notification Specialist child agent with Teams and Outlook connectors",
    "",
    "---",
    "",
    "## Step 5: Run Pre-Build",
    "",
    "Tell the user to:",
    "1. Open the Command Palette",
    "2. Run **CPSAgentKit: Run Pre-Build Checklist**",
    "3. Review the output — it will list what needs to be created in the Copilot Studio portal",
    "",
    "---",
    "",
    "## Step 6: Create Agents in Copilot Studio Portal",
    "",
    "Tell the user to create these agents in the Copilot Studio portal:",
    "",
    "### 6a. Parent Agent — IT Help Desk Orchestrator",
    "1. Go to https://copilotstudio.microsoft.com",
    "2. Create a new agent named **IT Help Desk**",
    "3. Set authentication to **Authenticate with Microsoft**",
    "4. Enable **Microsoft Teams** channel",
    "5. Under Settings → Generative AI, set orchestration to **Generative (preview)** or **Generative**",
    "6. Disable **Use general knowledge** (all answers must come from knowledge or tools)",
    "7. Disable **Web browsing**",
    "",
    "### 6b. Child Agent — Knowledge Specialist",
    "1. Inside the IT Help Desk agent, create a new child agent named **Knowledge Specialist**",
    '2. Set its description to: "Answers IT support questions from the Contoso IT Knowledge Base. Covers VPN, Wi-Fi, MFA, printers, software, passwords, and approved devices. Does NOT create tickets or send notifications."',
    "3. Add a **file-based knowledge source** — upload all 7 markdown files from the `sample-data/knowledge-articles/` folder in the workspace:",
    articleList,
    "",
    "### 6c. Child Agent — Notification Specialist",
    "1. Create another child agent named **Notification Specialist**",
    '2. Set its description to: "Sends notifications for High and Critical priority IT support tickets. Posts a message to the IT Support Teams channel and sends an email to itsupport@contoso.com. Only called by the parent after a ticket has been created. Does NOT create tickets or answer IT questions."',
    "3. Add the **Microsoft Teams** connector — configure it to post messages to a channel",
    "4. Add the **Office 365 Outlook** connector — configure it to send emails",
    "",
    "### 6d. Add Tools to Parent",
    "1. Back on the IT Help Desk parent agent, add the **Dataverse MCP Server** tool",
    "   - This is the ONLY path to Dataverse — do not add the standard Dataverse connector",
    "   - The MCP Server must be enabled on your managed environment (Settings → Product → Features → Dataverse Model Context Protocol)",
    "   - The `.vscode/mcp.json` was already created by this command — the Dataverse MCP Server is configured for GitHub Copilot in this workspace. Click **Start** above the server entry in `.vscode/mcp.json` to connect and authenticate.",
    '2. Add the **Office 365 Users** connector — use the **"Get my profile (V2)"** action (not "Get user profile" which requires a UPN input)',
    "",
    "---",
    "",
    "## Step 7: Clone and Sync Agent YAML Locally",
    "",
    "Tell the user to:",
    "1. Open the Command Palette",
    "2. Run **Copilot Studio: Open Environment** and select the environment where the IT Help Desk agent was created",
    "3. Run **Copilot Studio: Clone Agent** and select the **IT Help Desk** agent — this downloads the full agent definition into the workspace",
    "4. Once cloned, run **Copilot Studio: Get Changes** to ensure the local copy is fully up to date",
    "5. Confirm that agent YAML folders appear (topics/, actions/, etc.)",
    "",
    "---",
    "",
    "## Step 8: Build Agent Configuration",
    "",
    "Tell the user to:",
    "1. Open the Command Palette",
    "2. Run **CPSAgentKit: Build Agent**",
    '3. Select **"Full build"**',
    "4. Press Enter in Copilot Chat when the build prompt appears",
    "5. Copilot will generate:",
    "   - Agent instructions for all three agents",
    "   - Topic descriptions for routing",
    "   - Tool/action descriptions (modelDescription) for the Dataverse MCP Server, Teams, Outlook, and Office 365 Users connectors",
    "   - Settings validation recommendations",
    "6. If Dataverse MCP is connected, the build will also create the `cr85a_it_support_tickets` table and seed it with 5 sample tickets",
    "",
    seedData
      ? [
          "The seed data for the Dataverse table is:",
          "",
          "```",
          seedData.substring(0, 2000),
          "```",
          "",
        ].join("\n")
      : "",
    "---",
    "",
    "## Step 9: Apply Changes to Portal",
    "",
    "Tell the user to:",
    "1. Review the generated YAML changes in VS Code",
    "2. Open the Command Palette and run **Copilot Studio: Apply Changes** to push updates to the portal",
    "3. Go back to the Copilot Studio portal to confirm the instructions and descriptions are applied",
    "",
    "---",
    "",
    "## Step 10: Configure Portal-Only Settings",
    "",
    "Tell the user to set these in the Copilot Studio portal (these have no YAML equivalent):",
    "",
    "1. **Model:** Settings → Generative AI → set the model to **GPT-5** for best routing and instruction-following quality",
    "2. **Content moderation:** Settings → Generative AI → set to **Low** (specialist IT domain, reduces false positives on technical terms)",
    "3. **Verify settings coherence:**",
    "   - `Use general knowledge` should be **OFF**",
    "   - `Web browsing` should be **OFF**",
    "   - `Semantic search` should be **ON** (for knowledge sources)",
    "",
    "---",
    "",
    "## Step 11: Test the Agent",
    "",
    "Tell the user to open the test pane in Copilot Studio and try these conversations:",
    "",
    '1. **"How do I connect to VPN?"** — should route to Knowledge Specialist, return VPN setup steps',
    '2. **"My laptop screen is flickering and I can\'t work"** — should create a ticket via Dataverse MCP, then trigger notifications via the Notification Specialist',
    '3. **"What\'s the status of my ticket?"** — should query Dataverse MCP and return ticket details',
    '4. **"Update my [ticket name]"** — should find the ticket by name + user email, allow updating fields like priority, status, summary',
    '5. **"Delete my [ticket name]"** — should find the ticket, show details, and require explicit confirmation before deleting',
    '6. **"Can you help me submit my expenses?"** — should politely decline (out of scope)',
    '7. **"I think my account has been compromised"** — should escalate to human agent',
    "",
    "If any step misroutes or produces unexpected results, tell the user to copy the test pane output, then run **CPSAgentKit: Build Agent** → **Rebuild from test feedback** and paste the output.",
    "",
    "---",
    "",
    "## Done!",
    "",
    "Congratulate the user. They've built a multi-agent IT Help Desk with:",
    "- PnP CLI for Microsoft 365 MCP Server to create the IT Department team and Support Requests channel",
    "- Dataverse MCP Server for full ticket lifecycle — create, read, update, delete (on the parent — CPS constraint)",
    "- SharePoint knowledge on a dedicated child agent",
    "- Teams + Outlook notification on a dedicated child agent",
    "- Entra ID auth, Teams-only channel, no general knowledge",
  ];

  return sections.join("\n");
}
