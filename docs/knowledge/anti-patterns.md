# CPS Anti-Patterns

## Tool/Action Connection Anti-Patterns

**Renaming a tool without updating all references.** You CAN rename a tool/action connector, but if you do, you MUST update EVERY `/ToolName` reference in instructions, topic triggers, and any other YAML that references it. A single missed reference = broken agent. Prefer keeping existing names unless the user explicitly asks to rename.

**Using shortened or altered tool names in /ToolName references.** If the tool is "Microsoft Dataverse MCP Server (Preview)", referencing it as "/Dataverse MCP" or "/MCP Dataverse" won't match. The orchestrator requires exact name match.

**Recreating tools instead of updating them.** When a build step generates tool config, it should update the existing tool — not delete and recreate it. Recreating loses the connection setup.

**Not reading action YAML files before writing /ToolName references.** Always check the actual tool name from the workspace files. Don't assume or abbreviate.

## Architecture Anti-Patterns

**Single mega-agent with 40+ tools.** Routing degrades beyond 25-30 tools. The orchestrator starts ignoring instructions and misrouting. Split into child agents.

**Creating a child agent for every subtask.** Child agents add orchestration overhead and latency. Only use when the subtask has its own knowledge/tools, needs different governance, or you'll reuse it. A simple topic is often sufficient.

**Multi-level agent chaining.** Parent → child → grandchild is blocked. Design flat hierarchies. If you need depth, use child agents within connected agents.

**Circular agent dependencies.** A → B → A is blocked. Use hub-and-spoke with a central router.

**Relying on conversation history for state.** The orchestrator only sees 10 turns. Store critical state in variables.

## Prompt Anti-Patterns

**Negative constraints as primary control.** "Never discuss competitors" WILL be violated. Create a dedicated topic with a manual response instead.

**Long, complex instruction sets.** Beyond ~2000 characters, you get latency, timeouts, and degraded routing. If instructions are getting long, the logic belongs in topics.

**Vague tool/topic descriptions.** "Helper tool" or "Support topic" gives the orchestrator nothing to route on. Descriptions need specific intents AND explicit exclusions.

**Duplicate/overlapping descriptions.** Two tools described as "handles account queries" = coin flip routing. One must be differentiated or restricted to explicit invocation.

**Instructing default behaviour.** Don't instruct "be professional and polite" — it already is. Only add tone instructions for specific deviations.

**Trying to control retrieval via instructions.** "Always search document X first" is unreliable. The AI chooses based on query relevance.

## Knowledge Anti-Patterns

**Uploading entire documentation sites as one knowledge source.** The chunker doesn't understand topic boundaries. Split into focused, topic-specific documents.

**Ignoring knowledge source descriptions.** At >25 sources, bad descriptions mean entire knowledge sources never get searched.

**Large files without M365 Copilot license.** SharePoint files over 7 MB are silently ignored. No error — just no answers.

**Mixing unrelated content in one document.** Chunks may contain text from two unrelated topics, producing confused answers.

**Assuming knowledge works like a search engine.** CPS retrieval is non-deterministic. Identical queries can return different results depending on indexing state, user permissions, and orchestration context.

## Deployment Anti-Patterns

**Testing only in the test pane.** Test pane uses maker credentials. Production uses end-user credentials. Knowledge accessible to you may not be accessible to users. Always test in the target channel.

**Assuming Teams auto-updates.** Publishing changes don't propagate to all users automatically. Users can run different agent versions simultaneously.

**Deleting knowledge sources and assuming they're gone.** UI deletion doesn't remove the underlying reference. Check via API.

**Using maker connections in flows called by agents.** Blocked by DLP. Share flows with run-only permissions.

## The "It Worked Yesterday" Pattern

Common causes when a working agent suddenly breaks:

1. Knowledge source re-indexed with different chunking (after doc update)
2. User permissions changed (conditional access, SharePoint sharing)
3. Rate limits hit (accumulated conversation history pushing token limits)
4. Model version changed (GPT version updates can change behaviour)
5. Environment-level DLP policy changes
