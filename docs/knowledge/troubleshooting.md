# CPS Troubleshooting

## Agent Calls the Wrong Tool/Topic

1. Check the description — is it specific enough? Does it overlap with another tool's description?
2. If two tools overlap, restrict one to explicit invocation (clear "Allow agent to decide dynamically")
3. Check if the agent has too many tools (>25-30). Consider child agents to partition.
4. Check conversation history — the orchestrator uses context from previous turns which may bias routing.
5. Test in a fresh conversation vs ongoing — routing may differ.

## Agent Ignores Knowledge Sources

1. Check knowledge source status on the Knowledge page — is it "Ready"?
2. Check indexing — recently added files take 5-30 minutes.
3. Check file size — without M365 Copilot license, SharePoint files >7 MB are silently ignored.
4. Check user permissions — the agent only surfaces content the signed-in user can access.
5. Check the knowledge source description (>25 sources triggers description-based filtering).
6. If using generative orchestration, Conversational Boosting customisations are bypassed.

## Agent Gives Generic/Hallucinated Answers

1. Check if "Allow AI to use general knowledge" is enabled — disable for strict grounding.
2. Add explicit fallback instruction: "If the answer isn't in knowledge sources, say 'I don't have that information.'"
3. Check if generative answers node is properly configured in the relevant topic.
4. Check if documents contain the information the user is asking about (test SharePoint search directly).

## Agent Doesn't Respond in Teams

1. Test pane and M365 Copilot use different pipelines from Teams.
2. Check Teams app permission policies in Teams Admin Center.
3. Check Teams channel is properly enabled and published.
4. Verify a valid Greeting/Conversation Start topic exists.
5. Check all connectors/data sources are accessible to Teams users.
6. Re-add Teams channel, republish, allow time for sync.
7. "Typing then nothing" pattern = usually cold-start throttling or PDF knowledge latency. Migrate PDFs to SharePoint.

## OpenAIMaxTokenLengthExceeded

1. Switch from Activity Map to Transcript view to see the actual error.
2. Common cause: accumulated conversation history in long sessions.
3. Reduce system prompt length.
4. Limit knowledge base context retrieval.
5. Consider resetting conversations after a threshold.

## Child Agent Loops

1. Add explicit closing instruction: "End conversation and return to parent after completing the task."
2. Track completion with a variable on the parent side.
3. Check if the issue started after October 2025 update (known regression with Send Email V2).
4. Use "Run once" option on the child agent.

## Connected Agent Response Is Summarised/Truncated

1. This is by design — the orchestration layer summarises for consistency and security.
2. Try adding instruction on parent: "Return connected agent responses exactly as received including all links."
3. Try child agents instead of connected agents (slightly less summarisation).
4. For full fidelity, expose sub-agent logic as a custom tool/API.
5. [YOUR CONNECTED AGENT FIX FINDINGS GO HERE]

## Content Filtered Error

1. No diagnostic info available — this is a known gap.
2. Try rewording instructions to indicate the behaviour is expected.
3. Remove complex instructions and add back one at a time to identify the trigger.
4. Check if trigger payloads contain content that could be interpreted as harmful.

## Power Automate Flow Errors

1. Check the flow completed within 100 seconds.
2. Place post-response logic after "Return value(s) to Copilot Studio" step.
3. Check connector payload size (<5 MB public cloud, <450 KB GCC).
4. If using Dataverse: check valid values for choice columns. Bad values produce HTTP 400 with no useful detail.
5. Use a test Power Automate flow to replay the exact input data and get the real error message.

## Inconsistent Responses to Identical Queries

1. LLM non-determinism is normal — identical queries won't always give identical responses.
2. Check if documents were recently changed/moved (partial indexing).
3. Check if different users have different access permissions.
4. Check conversation context — previous turns influence routing and response.
5. Check if the agent is near rate limits.

## Dataverse MCP Server 403 — "Not Authorized to Access MCP"

When adding the Dataverse MCP Server tool to an agent, the connection fails with:

> The application '7ab7862c-4c57-491e-8a45-d52a7e023983' is not authorized to access MCP.

The Copilot Studio MCP client record doesn't exist in your environment's allowed clients list, even though the docs state it's "enabled by default."

**Prerequisites:**

- Power Platform administrator role
- The environment must be a Managed Environment
- The "Allow MCP clients to interact with Dataverse MCP server" toggle must be on

**Fix:**

1. Power Platform admin center → your environment → Settings → Product → Features
2. Confirm **Allow MCP clients to interact with Dataverse MCP server** is turned on
3. Click **Advanced Settings** — opens the classic Dataverse interface showing "Active Allowed MCP Clients"
4. If the list is empty (no client records were auto-provisioned), click **+ New**
5. Fill in:
   - **Name:** `Microsoft Copilot Studio`
   - **Unique Name:** `<yourprefix>_microsoftcopilotstudio` (e.g. `cr86a_microsoftcopilotstudio`)
   - **Application Id:** `7ab7862c-4c57-491e-8a45-d52a7e023983`
   - **Is Enabled:** Yes
6. Click **Save & Close**

**Finding your publisher prefix:** The Unique Name must start with your environment's publisher prefix or the save will fail with "Export key attribute uniquename for component allowedmcpclient must start with a valid customization prefix." Find it in Power Apps → Settings (gear) → Publishers → check the prefix on your default publisher (e.g. `cr86a_`, `new_`).

**After saving:** Return to Copilot Studio and re-add the Dataverse MCP Server tool. The 403 should be resolved.
