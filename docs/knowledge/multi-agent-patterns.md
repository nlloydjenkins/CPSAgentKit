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

**Instruction decomposition:** Even though CPS allows up to 8,000 characters of instructions, dense specialist logic often works better when split into focused child agents or prompt tools before hitting the hard limit. Use child agents as a platform-level partitioning mechanism — each gets its own orchestration budget, tool limits, and knowledge scope. The tradeoff is additional orchestration latency per child.

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
- Instruct the parent to preserve downstream outputs as labeled blocks (e.g., `CU_RELEVANCE_RAW`, `CU_CLARITY_RAW`) rather than paraphrasing them. This reduces information loss when passing one child's output to the next step.

### Output Preservation Pattern

When a parent agent needs to pass one child/tool/agent result to another downstream step, tell the parent to preserve the output as a labeled block rather than paraphrasing it. This is a mitigation for CPS generative orchestration, which normally summarises returned information into the final response. It reduces information loss but doesn't change the platform's underlying summarisation behavior.

### Child Agent Looping

Post-Oct 2025: child agents with tools (especially Send Email V2) fail to signal completion. Parent re-triggers in infinite loop.
Fix: Add explicit "end and return to parent" instructions in child + track completion with a variable on the parent side.

### Child Completion Behavior

After a child agent completes, the parent can be configured to: `Don't respond`, `Write the response with generative AI`, `Send specific response`, or `Send an adaptive card`. When using child agents as internal specialists in a larger plan, prefer output variables and downstream processing over immediate user-facing responses. Use the parent's "After running" behavior deliberately rather than accepting the default interaction style.

### MCP Tools Through Orchestration

MCP server tools on child agents are NOT invoked when called via parent orchestration. The child fires, MCP calls don't execute. Workaround: use agent flows with native connector actions and manual parameter passing.

Field observation: MCP is more reliable when the parent/orchestrator owns the MCP tool. Fetch what's needed at the parent level and pass results to children as context rather than relying on MCP execution inside child-agent orchestration.

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
