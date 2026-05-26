# Connecting Dataverse MCP Server to GitHub Copilot in VS Code

**Last verified:** 27 March 2026

---

## Prerequisites

- Visual Studio Code with **GitHub Copilot** and **GitHub Copilot Chat** extensions installed
- A **Power Platform** licence that includes Dataverse (Power Apps Developer Plan works — it's free)
- **Power Platform Administrator** role on your tenant
- Node.js v18 or later installed

---

## Step 1: Create a Managed Environment with Dataverse

The default environment won't work — MCP client configuration requires a **Managed Environment**.

### 1.1 Create a Developer Environment (with Dataverse)

1. Go to [make.powerapps.com](https://make.powerapps.com)
2. Click the **environment name** in the top-right banner
3. Look for **"Need your own environment (it's free)"** and click **Try it now**
4. This creates a developer environment **with Dataverse already provisioned**

> **Alternative:** If you create an environment from the Power Platform admin center, Dataverse is **not** added automatically. You must select the environment → click **Add database** → configure language and currency → save. Wait for provisioning.

### 1.2 Enable Managed Environment

1. Go to [Power Platform admin center](https://admin.powerplatform.microsoft.com)
2. Select **Manage → Environments**
3. Select your new environment
4. Click **Edit**
5. Toggle **Managed Environment** to **On**
6. Click **Save**

---

## Step 2: Enable the Dataverse MCP Server

### 2.1 Turn on MCP in Environment Settings

1. In the Power Platform admin center, select your managed environment
2. Go to **Settings → Product → Features**
3. Scroll down to **Dataverse Model Context Protocol**
4. Ensure **Allow MCP clients to interact with Dataverse MCP server** is toggled **On**

### 2.2 Allow the GitHub Copilot Client

1. From the same **Dataverse Model Context Protocol** section, click **Advanced Settings**
2. This opens the **Active Allowed MCP Clients** view
3. Find the **GitHub Copilot** entry in the list
4. Click into it and set **Is Enabled** to **Yes**
5. Click **Save & Close**

> **Note:** If the GitHub Copilot entry doesn't appear, add it manually: create a new client entry with a friendly name (e.g., "GitHub Copilot") and the appropriate client app ID, then enable it.

> **Gotcha:** If you see _"You do not have permission to access these records"_ when opening Active Allowed MCP Clients, the environment is **not a Managed Environment** or you lack the **Power Platform Administrator** role. Go back to Step 1.2.

---

## Step 3: Get Your Environment Details

1. Go to [make.powerapps.com](https://make.powerapps.com)
2. Switch to your **managed environment** using the environment picker (top-right)
3. Click the **Settings gear icon** → **Session details**
4. Copy the **Instance url** — e.g. `https://org1a2b3c4d.crm11.dynamics.com`

> **Important:** Copy the instance URL from your **managed environment**, not the default environment.

---

## Step 4: Configure the MCP Server in VS Code

### Option A: Command Palette (quickest)

1. Open VS Code
2. Command Palette: **Cmd+Shift+P** (Mac) / **Ctrl+Shift+P** (Windows/Linux)
3. Type `MCP: Add Server` → **Enter**
4. Select **HTTP** → **Enter**
5. Paste your instance URL with `/api/mcp` appended:
   ```
   https://org1a2b3c4d.crm11.dynamics.com/api/mcp
   ```
6. Press **Enter** — VS Code generates the configuration

### Option B: Edit config JSON manually

Create or edit `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "DataverseMcp": {
      "type": "http",
      "url": "https://org1a2b3c4d.crm11.dynamics.com/api/mcp"
    }
  }
}
```

For a global configuration, edit `~/.copilot/mcp-config.json` instead.

---

## Step 5: Start the Server and Authenticate

1. Open `.vscode/mcp.json` in VS Code
2. Click the **Start** button above the server configuration
3. Authenticate with your **Microsoft account** (must have admin access to the managed environment)
4. Server status should change to **Running**

---

## Step 6: Use It

1. Open GitHub Copilot Chat: **Cmd+Alt+I** (Mac) / **Ctrl+Alt+I** (Windows/Linux)
2. Switch to **Agent mode** (MCP tools are not available in Ask or Edit mode)
3. Click the **tools icon** (wrench) to verify Dataverse MCP tools are listed
4. Prompt examples:
   - `"List all tables in Dataverse"`
   - `"Create a table called ob_NewHire with columns for FullName, JobTitle, Department, StartDate"`
   - `"Describe the ob_NewHire table"`

> **Tip:** If you have multiple MCP servers, add **"in Dataverse"** to prompts to help routing.

---

## Troubleshooting

| Problem                                                    | Solution                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| "You do not have permission" in Active Allowed MCP Clients | Environment not Managed, or missing Power Platform Administrator role           |
| New environment has no Dataverse database                  | Admin center → select environment → Add database                                |
| Start button shows an error                                | Verify URL ends with `/api/mcp`. Check you're signing in with the right account |
| MCP tools don't appear in Copilot Chat                     | Must be in **Agent mode**. Click tools icon to check                            |
| GitHub Copilot client not in allowed list                  | Add manually in Advanced Settings → New → set name and app ID → enable          |
| Authentication loop                                        | Clear cached auth tokens, restart VS Code. Verify tenant ID matches             |

---

## Billing Note

Dataverse MCP tools are charged when accessed by AI agents outside of Copilot Studio (includes GitHub Copilot). Exempt with Dynamics 365 Premium licences or Microsoft 365 Copilot User Subscription Licence. Otherwise: 1 Copilot Credit per 10 tool calls.

---

## Known Gotchas (Preview)

Verified end-to-end against a tenant on 2026-05-20 while seeding a metric table. These are MCP-server limitations, not Dataverse limitations — many can be sidestepped by editing the column in the maker portal.

### Decimal columns silently cap at 0 → 1,000,000,000

`create_table` exposes `decimal` but does **not** expose `precision`, `scale`, `minValue`, `maxValue`, or any "large decimal" variant. Newly-created decimal columns get the Dataverse default range `0 → 1,000,000,000`. The error only surfaces on the first `create_record`:

```
A validation error occurred for <table>.<column>.
The value 312400000000 of type System.Decimal is outside the valid range(0 to 1000000000).
```

This blows up immediately on real-world financial / population data (banking balances, AUM, market cap, FX, customer counts above 1B, JPY/IDR/VND amounts, etc.).

**Mitigations, in order of preference:**

1. **Pre-scale to a smaller unit and document it on the row.** Store currency in millions or billions, and add a `Unit` column (`"GBP millions"`) so values are self-describing. This is the only mitigation that keeps the MCP-only authoring path intact.
2. **Use a `Currency` column** when the value is monetary — Currency columns honour Dataverse currency precision and avoid the generic decimal range trap.
3. **Create the column in the maker portal first** with the required min/max, then use the MCP for inserts. Breaks pure-MCP IaC, but is the only way to land raw >1e9 values without rescaling.

> **Don't seed first and rescale later.** Failed inserts in a parallel batch leave a few rows in the original unit before the maker switches to the new unit — the table ends up with mixed-unit rows that the agent cannot disambiguate. Validate the column range with one test row before any bulk insert.

### `update_table` is add-only

`update_table` can add new columns. It cannot alter the range, required-ness, display name, or type of an existing column. Recovery options if a column was created with the wrong constraints:

- Add a new column with the right shape, dual-write, migrate rows in your loader, drop the old column **in the maker portal** (per-column drop is not in the MCP).
- Drop and recreate the table (destructive — only viable before any data is seeded).
- Edit the column in the maker portal (breaks the IaC / scripted-build story).

Plan the schema before seeding. There is no MCP path to widen a column after the fact.

### `describe_table` omits range / precision / required-default metadata

`describe_table` returns column type and nullability only — e.g. `cr86a_value DECIMAL NOT NULL`. The min/max range Dataverse stores on the column metadata is **not** in the MCP output. Cross-check ranges and precision in the maker portal; do not trust `describe_table` for schema validation of decimal or numeric columns.

### Partial-failure semantics on batched `create_record`

Each `create_record` is independent. Parallel batches return per-call success/fault, so a partially-failing batch leaves a partially-populated table — no rollback. Recommended pattern when shape is uncertain:

1. Insert one representative row.
2. Verify it landed with `read_query`.
3. Batch the remainder.

For agents doing this autonomously, mention this pattern in the wrapping action's `modelDescription` so the orchestrator follows the same one-then-many shape.

### `read_query` parameter is `querytext`, not `query`

Every other SQL-shaped MCP server (mssql, postgres, sqlite) uses `query`. The Dataverse MCP uses `querytext`. The first call from a fresh agent typically fails with a schema-validation error. Set the parameter name explicitly in any prompt or instruction that calls `read_query`.

### MCP subtool descriptions are not in local YAML

The wrapping action YAML (`actions/MicrosoftDataverse-MicrosoftDataverseMCPServerPreview.mcs.yml`) carries a single `modelDescription` for the whole server. The descriptions of each subtool (`read_query`, `create_record`, etc.) live on the MCP server side and are not round-tripped into local YAML by `Get Changes`. Implications:

- To steer routing toward a specific table or unit convention, write the guidance into the **agent instructions** or the wrapping action's `modelDescription` — you cannot reach into the subtools.
- Toggling the MCP tool off and on to refresh subtools (the documented runtime-discovery procedure) does not change local YAML — there is no diff to review in source control.

See `constraints.md` → Dataverse Connector — Dynamic Schema Binding for the related "MCP subtools are portal/runtime-discovered" rule.
