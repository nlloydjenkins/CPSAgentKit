# Syncing Prompt Tool Text with Dataverse

Prompt tool instruction text is authoritative in **Dataverse**, not in the CPS action YAML in the workspace. This file describes how to read, edit, and write that text safely — and when to use the Dataverse MCP server vs a sync script.

---

## Where prompt text actually lives

| Location | What it contains | Editable? |
| --- | --- | --- |
| Workspace `actions/*.yaml` → `modelDescription` | Short orchestrator routing description (how the planner decides when to call the prompt tool) | Yes — portal or YAML |
| Dataverse `msdyn_aiconfiguration` table, `msdyn_customconfiguration` column | JSON blob containing the actual prompt instruction text, code segments, input definitions, model parameters, settings, signature | Yes — portal AI Hub / prompt editor, or via Dataverse API |

**Common confusion:** editing `modelDescription` in the action YAML does **not** edit the prompt tool's instruction text. They are two different fields in two different places. The `modelDescription` is what the orchestrator reads to decide whether to call the tool; the prompt instructions in `msdyn_customconfiguration` are what the model actually executes when the tool runs.

### Structure of `msdyn_customconfiguration`

The JSON blob contains several segments. Only the prompt text segments are authored content; everything else is platform-generated or model-configuration:

| Segment | What it is | Edit? |
| --- | --- | --- |
| `prompt` | The instruction text segments the model runs | Yes — this is the authoring target |
| `code` | Generated code (e.g. code interpreter scaffolding) | No |
| `definitions` | Input/output parameter schema | No — portal-managed |
| `modelParameters` | Model, temperature, max tokens, etc. | Portal only |
| `settings` | Tool-level settings | Portal only |
| `signature` | Platform signature | No — do not modify |

**Critical:** when writing back to Dataverse, replace only the `prompt` segments. Preserve `code`, `definitions`, `modelParameters`, `settings`, `signature` exactly as read. A write that overwrites other segments can break the tool.

### `{{variable}}` placeholders

Within the prompt text, `{{inputName}}` placeholders are the bindings that map the prompt tool's input parameters into the instruction text. Removing or renaming a placeholder breaks the tool — calls will fail or the input will not reach the model.

When editing prompt text, preserve the placeholder set exactly. Any sync script should assert that the set of `{{...}}` placeholders is unchanged between read and write.

---

## Two approaches

### Approach 1 — Dataverse MCP server (interactive, no custom tooling)

The Dataverse MCP server (see `dataverse-mcp-setup.md`) exposes Dataverse table operations to Copilot Chat in Agent mode. Prompt text is just a Dataverse record, so it can be read and written through the MCP server with no bespoke sync script.

**Works well for:**

- Browsing prompt tools in an environment (list, describe, read record)
- Ad-hoc interactive edits to a single prompt during iteration
- Schema inspection (column list, record shape)
- One-off triage ("summarise what this prompt does")
- Reducing local tooling — no MSAL cache, no sync script to maintain

**Workflow:**

1. Ask Copilot Chat (Agent mode): "read the `msdyn_aiconfiguration` record for prompt tool X"
2. Copilot returns the record with the `msdyn_customconfiguration` JSON blob
3. Copilot parses the JSON and presents the `prompt` segments for editing
4. You edit the text
5. Ask Copilot to "update the `msdyn_customconfiguration` on that record with the edited prompt segments, preserving all other fields"
6. Copilot constructs the updated JSON and calls the MCP update-record tool

**Limitations:**

- **Structural preservation is not enforced.** The "only touch `prompt`, preserve everything else" rule is a prompt-engineering request, not a code guarantee. A bad round-trip can corrupt the JSON. Read the updated record after writing to verify.
- **`{{variable}}` placeholder integrity** is at the mercy of the model. No automated assertion.
- **Batch operations** (N prompts to local files, diff, push selected) are awkward through chat.
- **No headless mode.** MCP needs an interactive MCP client; it is not a CLI. Cannot be used in CI.
- **Billing.** Dataverse MCP tool calls made by AI agents outside of Copilot Studio consume Copilot Credits unless the tenant has an exempting licence (Dynamics 365 Premium, M365 Copilot). See `dataverse-mcp-setup.md` → Billing Note. Frequent batch reads of many prompts multiply cost.
- **No git-tracked source of truth.** Dataverse is authoritative; there is no persisted local copy to diff against unless you save snapshots manually.

### Approach 2 — Sync script (scripted, git-tracked)

A bespoke sync script reads/writes `msdyn_aiconfiguration` records via the Dataverse Web API, maintaining editable copies of prompt text as `.md` files in the workspace.

**Works well for:**

- Bulk pull of all prompts into `prompt-text/*.md` for git tracking
- Bulk push of edited files back to Dataverse
- Cross-environment diff and review
- Structural-integrity enforcement (only `prompt` segments overwritten, placeholder set unchanged)
- CI / automated promotion between dev, test, prod (service-principal auth)
- Deterministic PATCH of `msdyn_customconfiguration` with a server-side-assembled payload

**Script guidelines:**

1. Maintain editable copies of prompt text as `.md` files in the workspace (e.g. `prompt-text/<tool-name>.md`)
2. On pull: fetch the record, parse `msdyn_customconfiguration`, write the `prompt` segments to the `.md` file
3. On push: read the `.md` file, fetch the current record, replace only the `prompt` segments in the parsed JSON, write back
4. Preserve `code`, `definitions`, `modelParameters`, `settings`, `signature` exactly as read
5. Assert `{{...}}` placeholder set is unchanged between read and write; fail the push if it is not
6. **Auth:** MSAL device-code flow with a cached token file works well for interactive sync. Service principal auth is preferable for CI.

Dataverse remains authoritative. The `.md` files are a convenience for editing and a git-tracked audit trail; the source of truth is the record in Dataverse.

---

## Recommended split

Use **both**, not either/or:

| Use case | Tool |
| --- | --- |
| Browsing prompt tools, inspecting schema, one-off reads | Dataverse MCP |
| Editing a single prompt interactively during active iteration | Dataverse MCP |
| Bulk pull of all prompts into `prompt-text/*.md` for git tracking | Script |
| Bulk push of edited `prompt-text/*.md` back to Dataverse | Script |
| CI / automated promotion between dev, test, prod | Script (service principal) |
| Cross-environment diff and review | Script |
| Ensuring structural integrity of `msdyn_customconfiguration` | Script with enforced preservation rules |

For small teams iterating on a few prompts, Dataverse MCP alone is often sufficient. As the number of prompts grows or the workflow needs reproducible environment promotion, introduce a script.

---

## CPSAgentKit MCP tools (recommended for the Build Agent)

The CPSAgentKit MCP server exposes two helpers that wrap the structural-integrity rules. The Build Agent uses these so that prompt-text edits proposed during a build are written safely.

| Tool | Purpose |
| --- | --- |
| `cps_parse_prompt_config` | Parse the `msdyn_customconfiguration` JSON returned by Dataverse MCP. Returns `prompts` (segments), `placeholders`, `topLevelKeys`, `segmentCount`. |
| `cps_build_prompt_update` | Given the original `msdyn_customconfiguration` and a new array of prompt segments, return a new JSON string ready to PATCH back. Validates segment count, segment roles, placeholder set, and top-level keys. **No payload is returned when validation fails** — so the Build Agent cannot accidentally write a corrupting PATCH. |

### Build Agent workflow

1. Build Agent decides a prompt tool needs an instruction change (e.g. spec changed, new boundary rule needed).
2. Build Agent calls Dataverse MCP `read_query` (or equivalent) to read the row from `msdyn_aiconfigurations` for that prompt tool — captures `msdyn_customconfiguration` as a string.
3. Build Agent calls `cps_parse_prompt_config` to inspect the current segments and placeholders.
4. Build Agent edits the segment text locally, preserving every `{{placeholder}}` exactly as-is.
5. Build Agent calls `cps_build_prompt_update` with the original string and the new segments. If `validation.ok === false`, the Build Agent revises and retries. If `validation.ok === true`, it takes `newCustomConfiguration`.
6. Build Agent calls Dataverse MCP `update_record` with the returned `newCustomConfiguration` string.
7. Build Agent re-reads the record to verify the round-trip wrote what it expected.

This loop never has to construct or hand-edit `msdyn_customconfiguration` JSON itself. The CPSAgentKit tools own the rules; Dataverse MCP owns the I/O.

---

## CI / headless promotion (`scripts/prompt-sync.mjs`)

The repo also ships a script for environments where MCP is not available — CI pipelines, automated promotion between dev/test/prod, or git-tracked review of prompt text changes.

```sh
# Bulk pull all prompt tools to prompt-text/<slug>.md
node scripts/prompt-sync.mjs pull --out prompt-text/

# Push edited files back, refusing any unsafe change
node scripts/prompt-sync.mjs push --in prompt-text/ --dry-run
node scripts/prompt-sync.mjs push --in prompt-text/
```

Auth: service-principal (client credentials flow) via four environment variables — `DATAVERSE_URL`, `DATAVERSE_TENANT_ID`, `DATAVERSE_CLIENT_ID`, `DATAVERSE_CLIENT_SECRET`. The script reuses the same `parsePromptConfig` / `buildPromptUpdate` helpers as the MCP tools, so structural-integrity guarantees are identical.

Each pulled file embeds an HTML comment with the record's `msdyn_aiconfigurationid` — that ID is the link back to the row on push. Do not delete that comment.

---

## Do not

- Do **not** edit prompt instructions by editing `modelDescription` in the action YAML — wrong field, wrong file.
- Do **not** overwrite `msdyn_customconfiguration` wholesale with only prompt segments — you will destroy `code`, `definitions`, `modelParameters`, `settings`, `signature`.
- Do **not** strip or rename `{{variable}}` placeholders.
- Do **not** rely on MCP for CI promotion — it has no headless mode.
- Do **not** assume prompt tool output binding schema is stable after editing inputs; see `troubleshooting.md` → Prompt Tool Output Binding Staleness.

## Related

- `dataverse-mcp-setup.md` — how to connect the Dataverse MCP server to VS Code
- `prompt-engineering.md` — what to put in the prompt text itself
- `anti-patterns.md` → Tool/Action YAML — which fields in action YAML are safe to edit
