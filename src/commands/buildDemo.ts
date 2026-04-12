import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import {
  requireWorkspaceRoot,
  openPromptInCopilotChat,
} from "../ui/uiUtils.js";

interface DemoPickItem extends vscode.QuickPickItem {
  demoId: string;
}

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

  // Let the user pick which demo to build
  const demoOptions: DemoPickItem[] = [
    {
      label: "IT Help Desk",
      description: "Interactive multi-agent Teams chatbot",
      detail:
        "3 agents — Dataverse MCP, SharePoint knowledge, Teams notifications",
      demoId: "it-help-desk",
    },
    {
      label: "Application Intake",
      description: "Autonomous mailbox-triggered pipeline",
      detail:
        "6 agents — email processing, compliance, accessibility, Dataverse connectors",
      demoId: "application-intake",
    },
  ];

  const pick = await vscode.window.showQuickPick(demoOptions, {
    title: "Select Demo",
    placeHolder: "Which demo do you want to build?",
  });
  if (!pick) {
    return;
  }

  const demoSrc = path.join(extensionPath, "demo", pick.demoId);

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
      title: `CPSAgentKit: Setting up ${pick.label} demo...`,
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

  // Demo-specific setup and walkthrough
  let prompt: string;

  if (pick.demoId === "it-help-desk") {
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

    prompt = composeItHelpDeskWalkthrough(knowledgeArticles, seedData);
  } else {
    // Application Intake — no MCP config needed (uses standard connectors)
    const knowledgeDir = path.join(root, "sample-data", "knowledge-sources");
    let knowledgeSources: string[] = [];
    try {
      const entries = await fs.readdir(knowledgeDir);
      knowledgeSources = entries.filter((e) => e.endsWith(".md")).sort();
    } catch {
      // Ignore
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

    prompt = composeApplicationIntakeWalkthrough(knowledgeSources, seedData);
  }

  await openPromptInCopilotChat(prompt);

  vscode.window.showInformationMessage(
    `CPSAgentKit: ${pick.label} demo walkthrough loaded into Copilot Chat — press Enter to start.`,
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

/** Compose the IT Help Desk guided walkthrough prompt */
function composeItHelpDeskWalkthrough(
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

/** Compose the Application Intake guided walkthrough prompt */
function composeApplicationIntakeWalkthrough(
  knowledgeSources: string[],
  seedData: string,
): string {
  const sourceList =
    knowledgeSources.length > 0
      ? knowledgeSources.map((s) => `  - ${s}`).join("\n")
      : "  (no knowledge sources found — check sample-data/knowledge-sources/)";

  const sections = [
    `You are guiding the user through building the Application Intake Agent demo — an autonomous, trigger-driven multi-agent Copilot Studio solution. This agent processes inbound emails from a shared mailbox without user interaction. Walk them through each step below one at a time. After each step, wait for the user to confirm they've completed it before moving to the next.`,
    "",
    `Do NOT perform these steps yourself. Describe exactly what the user needs to do in the Copilot Studio portal, in VS Code, or in the command palette. Be specific with setting names, button locations, and exact values to enter.`,
    "",
    "---",
    "",
    "## Step 1: Verify Prerequisites",
    "",
    "Tell the user to ensure:",
    "1. VS Code with the CPSAgentKit extension installed",
    "2. GitHub Copilot Chat enabled",
    "3. A Copilot Studio environment with a managed Dataverse environment",
    "4. Access to a shared mailbox (e.g. applications@contoso.com) with Send As permission for the maker account",
    "5. Microsoft Teams available for escalation channels",
    "",
    "---",
    "",
    "## Step 2: Create the Escalation Channel",
    "",
    "Tell the user to:",
    "1. Open **Microsoft Teams**",
    "2. Create a new team called **Applications Team** (or use an existing one)",
    "3. Add a channel called **Escalations**",
    "",
    "The orchestrator agent will post adaptive cards to this channel when cases need human review (contradictions, ambiguous intents).",
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
    "   - A parent orchestrator (Application Intake Orchestrator) owning all tools and connectors",
    "   - 5 child agents: Email Interpreter, Completeness Assessor, Correspondence Drafter, Compliance Evaluator, Accessibility Presenter",
    "   - All tools on the parent (child agents have no tools — CPS constraint)",
    "   - Pre-bound Dataverse connector actions (one per table) to avoid UnresolvedDynamicType",
    "   - Autonomous mailbox trigger owned by the parent",
    "   - Evaluate–revise–present loop in the routing logic",
    "",
    "---",
    "",
    "## Step 5: Run Pre-Build",
    "",
    "Tell the user to:",
    "1. Open the Command Palette",
    "2. Run **CPSAgentKit: Run Pre-Build Checklist**",
    "3. Review the output — expect flags for:",
    "   - Shared mailbox trigger configuration (portal)",
    "   - Pre-bound Dataverse actions per table (portal)",
    "   - Prompt tool creation for attachment preprocessing (portal)",
    "   - Content moderation setting (portal)",
    "   - Knowledge source upload (portal)",
    "",
    "---",
    "",
    "## Step 6: Create Agents in Copilot Studio Portal",
    "",
    "Tell the user to create these agents in the Copilot Studio portal:",
    "",
    "### 6a. Parent Agent — Application Intake Orchestrator",
    "1. Go to https://copilotstudio.microsoft.com",
    "2. Create a new agent named **Application Intake Orchestrator**",
    "3. Set authentication to **Authenticate with Microsoft**",
    "4. Under Settings → Generative AI, set orchestration to **Generative**",
    "5. Set the model to **GPT-5**",
    "6. Disable **Use general knowledge** (compliance-sensitive domain)",
    "7. Disable **Web browsing**",
    "8. Set content moderation to **Low** (Settings → Generative AI) — reduces false positives on housing/legal terms",
    "",
    "### 6b. Add Tools to Parent",
    "All tools must be on the parent agent (child agents are tool-less):",
    "",
    "1. **Microsoft Dataverse — List rows from selected environment** — for reading applications, correspondences, compliance checks",
    "2. **Microsoft Dataverse — Add a new row** — create **3 separate pre-bound actions** (one per table):",
    '   - **"Create application record"** → entity = `cr85a_applications`',
    '   - **"Log correspondence"** → entity = `cr85a_correspondences`',
    '   - **"Log compliance check"** → entity = `cr85a_compliancechecks`',
    "   - For each: set the `entityName` input to a fixed value (not dynamic)",
    "3. **Microsoft Dataverse — Update a row in selected environment** — for status updates",
    "4. **Office 365 Outlook — Get email (V3)** — for retrieving inbound messages",
    "5. **Office 365 Outlook — Send an email from a shared mailbox (V2)** — for outbound correspondence",
    "6. **Microsoft Teams — Post adaptive card and wait for a response** — for escalation to the Applications Team > Escalations channel",
    "",
    '**Important:** After creating the 3 pre-bound "Add a new row" actions, **disable the generic "Add a new row" tool** — otherwise the orchestrator will prefer it over the targeted tools.',
    "",
    "### 6c. Create Attachment Preprocessor Prompt Tool",
    '1. In Copilot Studio or AI Hub, create a new prompt tool named **"Attachment Preprocessor"**',
    "2. **Enable code interpreter** in the prompt settings",
    "3. Input: attachment content + case context",
    "4. Output: normalised text/Markdown extracted from the attachment",
    "5. Save and sync locally after creation",
    "",
    "### 6d. Create 5 Child Agents",
    "",
    "**Email Interpreter:**",
    "1. Create a child agent named **Email Interpreter**",
    '2. Set description to: "Classifies inbound emails by application type, extracts structured fields (applicant name, email, account number, dates), detects thread continuations, and identifies contradictions. Does NOT assess completeness, draft responses, or check compliance."',
    "3. Add a file-based knowledge source — upload `application-type-definitions.md` from `sample-data/knowledge-sources/`",
    "",
    "**Completeness Assessor:**",
    "1. Create a child agent named **Completeness Assessor**",
    '2. Set description to: "Evaluates whether extracted fields satisfy the minimum requirements for the identified application type. Returns a verdict (PROCEED, REQUEST_INFO, or ESCALATE) with lists of missing and ambiguous fields. Does NOT extract fields, draft responses, or check compliance."',
    "3. Add the same `application-type-definitions.md` knowledge source",
    "",
    "**Correspondence Drafter:**",
    "1. Create a child agent named **Correspondence Drafter**",
    '2. Set description to: "Drafts outbound email responses based on the completeness verdict. Produces acknowledgements, information requests, or escalation notices. Does NOT assess completeness, check compliance, or apply accessibility formatting."',
    "3. Add the same `application-type-definitions.md` knowledge source",
    "",
    "**Compliance Evaluator:**",
    "1. Create a child agent named **Compliance Evaluator**",
    '2. Set description to: "Reviews draft correspondence against 8 compliance rules covering unauthorised commitments, required disclosures, data leakage, tone, jargon, accuracy, timelines, and regulatory references. Returns PASS or FAIL with specific revision instructions. Does NOT draft correspondence, assess completeness, or format for accessibility."',
    "3. Add a file-based knowledge source — upload `compliance-rules.md` from `sample-data/knowledge-sources/`",
    "",
    "**Accessibility Presenter:**",
    "1. Create a child agent named **Accessibility Presenter**",
    '2. Set description to: "Applies plain English and dyslexia-friendly formatting to approved correspondence. Targets Grade 5 reading level, uses approved word substitutions, and structures emails with clear headers and short paragraphs. Does NOT draft content, check compliance, or assess completeness."',
    "3. Add a file-based knowledge source — upload `accessibility-standards.md` from `sample-data/knowledge-sources/`",
    "",
    "Knowledge source files used:",
    sourceList,
    "",
    "---",
    "",
    "## Step 7: Create Dataverse Tables",
    "",
    "Tell the user to create 3 Dataverse tables with the schemas defined in `Requirements/docs/systems-context.md`:",
    "",
    "1. **cr85a_applications** — 17 columns including choice fields for application_type, status, direction, overall_confidence",
    "2. **cr85a_correspondences** — 8 columns including choice fields for direction and correspondence_type",
    "3. **cr85a_compliancechecks** — 7 columns including choice field for result",
    "",
    "**Critical:** All choice columns require integer values. The integer mappings are documented in `Requirements/docs/systems-context.md`. Verify mappings against the live Dataverse schema after creation.",
    "",
    "---",
    "",
    "## Step 8: Configure Autonomous Trigger",
    "",
    "Tell the user to:",
    "1. On the parent agent (Application Intake Orchestrator), add a **mailbox event trigger**",
    "2. Point it at the shared mailbox (e.g. `applications@contoso.com`)",
    "3. The trigger fires when a new email arrives — the agent processes it without user interaction",
    "",
    "**Important:** Autonomous triggers can only be owned by top-level (parent) agents. Child agents cannot own triggers.",
    "",
    "---",
    "",
    "## Step 9: Clone and Sync Agent YAML Locally",
    "",
    "Tell the user to:",
    "1. Open the Command Palette",
    "2. Run **Copilot Studio: Open Environment** and select the environment",
    "3. Run **Copilot Studio: Clone Agent** and select the **Application Intake Orchestrator**",
    "4. Run **Copilot Studio: Get Changes** to ensure the local copy is fully up to date",
    "5. Confirm that agent YAML folders appear (topics/, actions/, agents/, etc.)",
    "",
    "---",
    "",
    "## Step 10: Build Agent Configuration",
    "",
    "Tell the user to:",
    "1. Open the Command Palette",
    "2. Run **CPSAgentKit: Build Agent**",
    '3. Select **"Full build"**',
    "4. Press Enter in Copilot Chat when the build prompt appears",
    "5. Copilot will generate:",
    "   - Parent orchestrator instructions with 11 numbered pipeline stages and anti-termination controls",
    "   - 5 child agent instructions with explicit boundary enforcement (prohibitions on what each must NOT assess)",
    "   - Tool modelDescription values for all connector actions (with choice integer mappings, column lists, and OData filter examples)",
    "   - Connector action input descriptions for autonomous execution (value sources, 'never ask the user', N/A sentinel handling)",
    "   - Settings validation recommendations",
    "6. Review the generated YAML changes",
    "7. Run **Copilot Studio: Apply Changes** to push updates to the portal",
    "",
    "---",
    "",
    "## Step 11: Seed Dataverse",
    "",
    "Tell the user to load the 5 sample application records from `sample-data/dataverse-seed-data.md` into the `cr85a_applications` table. They can:",
    "- Use the Dataverse web interface (make.powerapps.com → Tables → cr85a_applications → Edit)",
    "- Use the Dataverse MCP tool in GitHub Copilot Agent mode",
    "- Use a Power Apps model-driven app",
    "",
    seedData
      ? [
          "The seed data is:",
          "",
          "```",
          seedData.substring(0, 2000),
          "```",
          "",
        ].join("\n")
      : "",
    "---",
    "",
    "## Step 12: Test",
    "",
    "Tell the user to test by sending emails to the shared mailbox. Use the scenarios from `Requirements/docs/sample-interactions.md`:",
    "",
    "1. **Complete application** — send Scenario 1 email → expect: full pipeline runs, acknowledgement email sent, Dataverse records created",
    "2. **Incomplete application** — send Scenario 2 email → expect: information request email listing missing fields",
    "3. **Reply with missing info** — reply to Scenario 2 thread with missing fields → expect: thread match, field merge, acknowledgement",
    "4. **Contradiction** — send Scenario 4 with conflicting account number → expect: Teams adaptive card posted to Escalations channel",
    "5. **Ambiguous intent** — send Scenario 5 email → expect: Teams escalation (Unknown/Ambiguous type)",
    "6. **Compliance check** — verify every outbound email passed through Compliance Evaluator (check Activity Map)",
    "7. **Accessibility** — verify outbound emails use plain English, short paragraphs, no jargon",
    "",
    "**Check in the Activity Map for each test:**",
    "- Correct child agents invoked in the right order",
    "- No child agent output displayed directly (suppressed by anti-termination instructions)",
    "- Pipeline completed all stages (didn't stop after first child)",
    "- Dataverse records created/updated correctly (applications, correspondences, compliance checks)",
    "- Compliance Evaluator invoked for every outbound email",
    "- Accessibility Presenter invoked after compliance pass",
    "",
    "If any step misroutes or stops early, tell the user to paste the test output back into **CPSAgentKit: Build Agent** → **Rebuild from test feedback**.",
    "",
    "---",
    "",
    "## Done!",
    "",
    "Congratulate the user. They've built an autonomous multi-agent Application Intake pipeline with:",
    "- Mailbox event trigger for fully autonomous email processing",
    "- 6 agents with strict boundary enforcement (parent + 5 specialists)",
    "- Pre-bound Dataverse connector actions for multi-table writes",
    "- Evaluate–revise–present loop (Compliance → Drafter revision → Accessibility)",
    "- N/A sentinel pattern for optional fields in autonomous pipelines",
    "- Anti-termination instructions preventing early pipeline stops",
    "- Teams adaptive cards for human-in-the-loop escalation",
    "- 3 domain-specific knowledge sources (compliance rules, accessibility standards, application types)",
  ];

  return sections.join("\n");
}
