# Copilot Studio Assessment Guide — Part 5: Gotchas, Bugs & Known Issues

The stuff that will catch you out. Gathered from official known issues, community reports, and practitioner experience as of March 2026.

---

## Silent Failures (Things That Break Without Telling You)

These are the most dangerous issues because you won't know something is wrong until a user reports it or you investigate manually.

### Knowledge Source Silent Failures

- **SharePoint files over 7 MB (without M365 Copilot licence):** The file shows as a valid knowledge source but is silently ignored during retrieval. No error in the authoring experience, no error at runtime — the agent simply doesn't include content from that file. Split files under 7 MB or enable Tenant Graph Grounding.
- **Sensitivity-labelled documents (Confidential/Highly Confidential) and password-protected files:** Show as "Ready" in the knowledge source list but never provide responses. No error surfaces.
- **Knowledge source "Ready" status is misleading:** After adding files/folders, status shows "Ready" immediately, then changes to "In Progress." Content isn't usable until it returns to "Ready" a second time. If you test during the initial false "Ready" state, you'll get no results and think the source is broken.
- **SharePoint grounding fails silently without M365 Copilot licence:** CDX demo tenants and users without Copilot licences can create and publish agents with SharePoint knowledge, but grounded retrieval fails at runtime with only a generic error. No indication that licensing is the cause.
- **Classic ASPX pages, SPFx components, accordion nav, custom CSS:** Content from these SharePoint configurations is silently excluded from generative answers. No warning in the authoring experience.
- **Deleted knowledge sources persist in the API:** When you delete a knowledge source via the UI, it's removed visually but remains accessible via the API. This creates phantom references that can cause issues during solution export/import.

### Variable and Context Silent Failures

- **ACS channel 28 KB limit:** When transferring to Omnichannel, if the total size of all passed variables exceeds 28 KB, the transfer completes but all variables are silently dropped. The handoff appears successful but the receiving agent has no context.
- **Encrypted content without EXTRACT/VIEW rights:** If a user doesn't have the required usage rights on encrypted content, Copilot silently skips it. The agent responds based on whatever other content it can access, which may produce incomplete or misleading answers.

---

## ALM and Deployment Bugs

### Managed Solution Errors

- **Vague SQL errors when placing agents in managed solutions.** These appear to originate from knowledge source references or connection references that don't transfer cleanly. The errors are uninformative and don't point to the specific source of the problem.
- **Ghost knowledge sources after deletion:** Removing a knowledge source from the UI doesn't fully remove it from the solution. It persists in the API and can cause SQL errors during import. Check via API after deletion.
- **No automated knowledge source processing on import.** This applies to ALL unstructured data sources (SharePoint files/folders, OneDrive, Salesforce, Confluence, ServiceNow, ZenDesk). After importing a solution, you must manually re-process every knowledge source in the target environment.

### Teams Channel Versioning

- **Publishing to Teams doesn't auto-update end users.** After publishing a new version, users continue running whatever version they had. There is no mechanism to force users onto the latest version. Users in the same organisation will be running different versions simultaneously.
- **No version diffing or rollback.** You cannot compare two versions of an agent to see what changed, and there is no rollback capability. Your only option is manual reversion.

---

## Generative Orchestration Gotchas

### Non-Deterministic Behaviour

- **Same query, different results in different contexts.** The agent uses conversation history and context to influence decisions. A query in a fresh test panel conversation may produce a different response than the same query mid-way through a Teams conversation with prior messages. This is by design but can confuse testing.
- **System topics like "Multiple topics matched" aren't used in generative mode.** The planner handles disambiguation differently. If you relied on this in classic mode, the behaviour changes.
- **Overlapping topic descriptions cause multi-invocation.** If two topics have similar descriptions, the agent may invoke both for a single query. This isn't always wrong, but it can produce bloated or confusing responses. Test and narrow descriptions.

### Instruction Interpretation

- **Instructions are interpreted, not executed.** The agent treats instructions as guidance, not as hard rules. It can and will deviate from instructions if the LLM's reasoning suggests a different approach. Critical constraints should be enforced through topic logic (deterministic layer), not instructions alone.
- **"Do not" instructions are weaker than "always" instructions.** Telling the agent what NOT to do is less reliable than telling it what TO do. "Always redirect pricing questions to the sales team" works better than "Do not answer pricing questions."
- **Long instructions dilute important rules.** The 8,000-character limit feels generous, but if you fill it with low-priority guidance, critical rules get less attention from the model. Front-load the most important constraints.

### Knowledge Retrieval Limitations

- **Cannot force a specific knowledge article.** The AI selects relevant content based on the query. You cannot instruct the agent to "always check Document X first."
- **File/document name queries don't work.** Users cannot ask "What does file-name.pdf say about X?" — the agent cannot match queries against specific file names in SharePoint knowledge sources.
- **Exhaustive retrieval performance degrades at scale.** When a query requires the agent to retrieve information from hundreds of files, performance degrades due to context window limitations. Users experience slower or lower-quality responses.

---

## Content Filtering Issues

- **Zero transparency on ContentFiltered responses.** When an agent response is blocked by content filtering, Microsoft provides no logging, no reason code, and no detail explaining what triggered the filter. The response simply doesn't appear or shows a generic error.
- **No way to tune or override content moderation.** The built-in responsible AI filtering cannot be adjusted. If your legitimate business use case triggers the filter (e.g. medical terminology, legal language, discussion of security vulnerabilities), you have no recourse except filing a support ticket.
- **Word, Excel, PowerPoint DLP messaging unclear.** When Purview DLP blocks a Copilot interaction in Office apps, the user messaging may not clearly state that it was blocked by an organisational policy. The interaction is still blocked, but the user may not understand why.

---

## Multi-Agent Architecture Issues

- **Child agents cannot invoke MCP servers.** Tool invocation fails when the MCP server is attached to a child agent. All MCP calls must proxy through the parent agent. This fundamentally limits the specialisation model for multi-agent architectures.
- **No visibility into tenant runtime version.** MCP support, multi-agent behaviour, and orchestration features are tied to the runtime version. There's no clear way to check which version your tenant is running or when it was last updated. Troubleshooting becomes guesswork.
- **Tool execution failures are opaque.** Conversation logs show text flow but don't reveal whether a child agent attempted to call an MCP server, whether the call succeeded, or why it failed. There are no structured logs or developer mode for tool invocation tracing.

---

## Licensing Confusion and Gotchas

- **M365 Copilot licence ≠ Copilot Studio licence.** M365 Copilot includes access to Copilot Studio for building and using internal agents. But for external-facing agents or agents that exceed included capacity, a standalone Copilot Studio licence (credit packs) is required.
- **"Included" agent usage is only for interactive, licensed-user scenarios.** Autonomous runs (scheduled, event-triggered, Power Automate-triggered) always consume credits regardless of user licensing.
- **Testing unpublished agents consumes credits.** Credit usage is based on actions performed, not publication status. Prompts and models in agent flows consume credits even during testing. Only the embedded test chat and prompt builder testing are free.
- **Proactive greetings are billed.** Even if the user never responds, the agent greeting consumes a Classic Answer credit.
- **Documentation is confusing and sometimes contradictory.** Multiple community reports describe situations where M365 Copilot-licensed users hit rate limits or "usage limit reached" errors on custom agents, despite documentation stating their usage is included. The issue is typically environment-level quotas rather than licence limits, but the error messages don't distinguish between the two.

---

## Platform Stability Issues

### Inconsistent Agent Behaviour

- **Agents that worked stop working with no config changes.** Multiple practitioners report agents that functioned correctly then began producing different or degraded results without any changes to instructions, knowledge, or topics. This is likely related to backend model updates or runtime version changes, neither of which are visible to the maker.
- **Feature behaviour changes after platform updates.** UI elements may change, disappear, or behave differently after updates. Features tested in preview may not work the same way when they reach GA.

### Knowledge Source Reliability

- **Significant reformatting needed for acceptable results.** Community consensus is that raw business documents rarely work well as knowledge sources. Headers, section breaks, concise language, and structured formatting are required for the retrieval layer to find relevant content reliably.
- **SharePoint list limitations are extensive.** The number of unsupported scenarios (attachments, lookup columns, views, glossaries, document libraries, guest users) makes SharePoint lists a risky knowledge source for all but simple use cases.

---

## API Plugin Limitations (Declarative Agents)

These apply when building API plugins for declarative agents in M365 Copilot:

- **Nested objects** in API method request bodies or parameters are not supported. Use a flattened schema.
- **Polymorphic references** (oneOf, allOf, anyOf) and circular references are not supported.
- **API keys in custom headers, query parameters, or cookies** are not supported.
- **OAuth grant flows** limited to vanilla Authcode and PKCE Authcode only.
- **Dual authentication flows** (OAuth/Entra SSO + HTTP Bearer token) for a single API endpoint are not supported.
- **No Settings UI to reset "always allow" states.** Workaround: uninstall the app to reset.

---

## Marketing vs. Reality

- **Features marketed as GA that are still in preview.** This has happened multiple times and erodes trust. Always check the release notes and feature documentation for actual status before making commitments to customers.
- **YouTube tutorials frame product limitations as user error.** Common in the community, but many issues that look like bad agent design are actually platform-level limitations. Validate against known issues before blaming your configuration.
- **Documentation doesn't keep pace with feature changes.** Microsoft's Learn docs are frequently eclipsed by new functionality. Cross-reference documentation dates, release notes, and community posts when something doesn't match your experience.
