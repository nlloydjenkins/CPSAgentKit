# CPS Multi-Agent Patterns

## When to Use Multiple Agents

Split into multiple agents when:
- Parent's tool set exceeds ~25-30 tools and routing degrades
- Subtasks need different governance, auth, or access controls
- You want to reuse a capability across multiple parents
- Different teams own different domains

Do NOT split when:
- Simple, single-purpose agent
- Context-switching overhead outweighs routing benefit
- You need full-fidelity responses with citations (stripped in handoffs)

## Child Agents vs Connected Agents

**Child agents:** lightweight, embedded in parent. Share parent's environment. Own instructions, knowledge, tools. Own orchestration limits (separate from parent). Not independently accessible. Use for logical grouping within one solution.

**Connected agents:** independently published. Own auth, own lifecycle. Must be published + sharing enabled. Can be reused across parents. Use when separate ownership, deployment, or governance is needed.

You can mix both. Connected agents can contain their own child agents.

## Architecture Pattern: Hub-and-Spoke

For complex solutions, use a router/orchestrator parent with specialised children:
```
User → Router Agent → Billing Agent
                    → Tech Support Agent
                    → Account Agent
```

The router's instructions focus purely on intent classification and delegation. Domain knowledge lives in the children.

## Known Limitations

### Response Summarisation
Connected agent responses are ALWAYS summarised by the parent. This is by design — the orchestration layer "sanitises" responses for consistency and security. Long, detailed responses get compressed. Citations and SharePoint links are stripped.

Partial workarounds:
- Instruct parent to return child responses as-is (sometimes helps)
- Use child agents instead of connected agents (slightly better)
- Expose sub-agent logic as a custom tool/API (bypasses summarisation)
- [YOUR FINDINGS FROM CONNECTED AGENT FIX GO HERE]

### Child Agent Looping
Post-Oct 2025: child agents with tools (especially Send Email V2) fail to signal completion. Parent re-triggers in infinite loop.
Fix: Add explicit "end and return to parent" instructions in child + track completion with a variable on the parent side.

### MCP Tools Through Orchestration
MCP server tools on child agents are NOT invoked when called via parent orchestration. The child fires, MCP calls don't execute. Workaround: use agent flows with native connector actions and manual parameter passing.

### No Circular Dependencies
Agent A → Agent B → Agent A is blocked. Use hub-and-spoke.

### No Multi-Level Chaining
Parent → child → child's child is blocked. Flatten, or use child agents within connected agents.

### The Ghost Message
Parent with no topics/knowledge + "Don't respond" after child = platform sends unsolicited `explanation_of_tool_call` message from the orchestration runtime.

## Data Handoff

- Conversation history passed by default to connected agents
- For child agents, orchestration manages context internally
- Conversation history limited to 10 turns — critical state must be in variables
- Pass specific parameters via input/output variables when possible rather than relying on history

## Governance

- Log when connected agents are invoked — separate transcripts per agent
- Correlate parent and child sessions via telemetry identifiers
- Connected agents may have different privileges or knowledge — apply audit controls
- Auth must be compatible: if child requires auth, parent must use same method
- Manual auth (Generic OAuth2) on parent is not compatible with authed connected agents

## When to Promote Child → Connected

Promote a child agent to a connected agent when:
- You want to reuse it across multiple parents
- It needs separate publishing/versioning
- Different teams need to own and maintain it
- It needs different auth or governance rules
