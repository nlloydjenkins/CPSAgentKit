# Copilot Studio Assessment Guide — Part 4: Tools, Actions & Multi-Agent Patterns

How to connect agents to external systems and design multi-agent architectures.

---

## Tools and Connectors

### Design Principles

- **Each tool should have a clear, single-purpose interface.** Define input parameters with expected types, output variables, and error conditions. The orchestrator treats tools as reliable functions — make them behave that way.
- **Test tools for deterministic behaviour.** Given the same inputs, a tool should produce the same outputs. Non-deterministic tools confuse the orchestrator's planning and make debugging much harder.
- **Tool names matter more than descriptions.** The planner gives more weight to tool names when deciding what to invoke. Use active, descriptive names: `TranslateText`, `CheckOrderStatus`, `CreateSupportTicket`. Never `Flow1` or `Action_3`.
- **Curate your toolkit.** Connect all useful actions, but remove or disable tools that are irrelevant or risky. A smaller set of high-quality choices is better than an exhaustive set with overlaps. Overlapping descriptions cause the agent to invoke multiple tools unnecessarily.

### Tool Count Guidance

- **Hard platform limit:** 128 tools per agent
- **Practical limit:** 25–30 tools. Beyond this, the model's ability to select the correct tool degrades. Response latency increases and the planner may invoke unrelated tools.
- If an agent needs more than 30 tools, split into connected agents or sub-agents with distinct domains.

### Custom Connector vs MCP Server — Decision Guide

| Decision Factor            | Custom Connector                                                              | MCP Server                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Best for**               | Power Platform-native APIs, SharePoint lists, Dataverse, certified connectors | External SaaS APIs, custom microservices, cross-platform tool sharing       |
| **Auth model**             | Per-connection (OAuth, API key, Windows Auth) — managed by Power Platform     | OAuth 2.0 or API key — configured in mcp.json; server-side token management |
| **DLP governance**         | Full DLP policy enforcement — classify, block, endpoint filter                | MCP allow/deny tool controls; no DLP connector-level classification yet     |
| **ALM / solution support** | Included in Power Platform solutions; exports with agent                      | External server — must be deployed and versioned separately                 |
| **Payload limit**          | 5 MB public / 450 KB GCC                                                      | No platform-imposed limit (server-dependent)                                |
| **Latency**                | Power Platform connector runtime overhead                                     | Direct HTTP — potentially lower latency for external APIs                   |
| **Multi-agent sharing**    | Connector shared across agents in same environment                            | MCP server can serve multiple agents, platforms, and non-CPS clients        |
| **Offline / local**        | Cloud only                                                                    | Can run locally for dev/test (stdio transport)                              |
| **Maturity**               | GA, well-documented, thousands of certified connectors                        | GA in CPS but evolving rapidly; fewer governance controls                   |

**Decision heuristic:** Use a Custom Connector when the API is already in the Power Platform connector ecosystem or when DLP governance is mandatory. Use an MCP Server when the API is external, needs to be shared across non-Power-Platform clients, or when the connector ecosystem doesn't cover the API.

### Agent 365 Tooling Servers

Agent 365 Tooling Servers (preview) bundle enterprise M365 tool collections into a single MCP-compatible server that can be attached to any Copilot Studio agent.

**Key characteristics:**

- Pre-built bundles for common M365 operations (e.g. SharePoint CRUD, Teams messaging, Outlook calendar)
- Runs with delegated user identity — actions execute as the signed-in user, not the maker
- Governed by existing M365 permissions and Conditional Access policies
- Reduces the need to build individual connectors for common M365 operations

**When to use:** When the agent needs broad M365 integration (read/write SharePoint, send Teams messages, manage calendar) and per-user identity is required. Replaces the pattern of building multiple custom connectors for M365 APIs.

**When NOT to use:** When fine-grained DLP control per operation is needed (Agent 365 is governed at the server level, not per-tool). When the agent only needs one or two M365 operations — a single connector action is simpler.

### Power Automate Flows as Actions

- **Flows run as the flow author by default, not the end user.** When a Power Automate flow is invoked as an action from an agent, every connection inside that flow uses the credentials of whoever created (or last modified) the flow — the maker. The end user's identity is not passed through. This means the flow accesses data with the maker's permissions, not the user's. This is a major limitation for scenarios that require per-user data access, audit trails, or least-privilege enforcement.
- **Per-connection identity override:** Individual connections inside a flow can be reconfigured to "Provided by run-only user" (end-user delegated) instead of "Embedded" (maker). However, the agent must be configured for Entra ID authentication, the user must consent to each connection type, and not all connectors support delegated identity. Test each connection type individually.
- **If the flow must run as the maker:** Apply strict least privilege to the maker account. Use a dedicated service account rather than a personal maker account. Document which flows use maker identity and audit their permissions regularly. Consider this a security-sensitive pattern.
- Flows used as actions have a **100-second timeout.** If the flow takes longer than 100 seconds to return a response, the agent receives no output. Optimise queries and data returned from backend systems.
- **Long-running flow logic should be placed after the "Return value(s) to Copilot Studio" step.** If some flow logic can continue running after a result is sent to the agent, move those actions after the return step.
- **Maker connection blocking:** Administrators can prevent agents from using maker credentials in flow connections. If blocked, you must share the flow with run-only permissions in Power Automate.
- **Known reliability issue:** Power Automate flows as actions in declarative agents may not run reliably and may not return results. Newly created flows may not appear in the Add Action interface even if the action counter reflects their presence. Workaround: edit the flow description on the flow details page outside of Copilot Studio to improve trigger success.

### Connector Payload Limits

- **Public cloud:** 5 MB connector payload limit
- **GCC (Government Community Cloud):** 450 KB — dramatically lower
- If your flow returns large datasets, filter and reduce the payload before returning to the agent

### HTTP Requests

- Agents can make HTTP requests via the HTTP request node
- Can be blocked by DLP policy (block the HTTP connector)
- Useful for direct API integration without Power Automate, but offers less governance control

---

## Multi-Agent Patterns

### Parent-Child Architecture

Copilot Studio supports delegating messages from a parent agent to child (connected) agents. The parent agent acts as the orchestrator, routing requests to specialised child agents.

**Critical limitation: Child agents cannot invoke their own MCP servers.** Tool invocation fails if the MCP server is attached to the child agent. All MCP calls must be proxied through the parent agent. This means every multi-agent design today requires the parent to own all external integrations, which is clunky and defeats the purpose of specialisation.

**Practical impact:** If you're designing a multi-agent architecture where each child agent handles a specific domain (HR, IT, Finance), you cannot give each child its own set of external tools via MCP. All tools must be configured on the parent, and child agents can only handle conversation logic and knowledge retrieval.

### When to Use Multi-Agent

- **Domain specialisation:** Different business domains (HR, IT, Finance) each have distinct knowledge bases and conversation patterns
- **Team ownership:** Different teams maintain different agents independently
- **Scale:** A single agent's topic limit (1,000) or instruction limit (8,000 chars) is insufficient for the full scope

### When NOT to Use Multi-Agent

- **Simple scenarios:** If a single agent with good instructions and 5–10 topics covers the use case, don't add multi-agent complexity
- **When you need shared MCP tools across agents** — the parent-proxying requirement makes this painful
- **When you need deterministic routing** — the generative planner's agent selection can be unpredictable

### Context Passing Between Agents

When the orchestrator delegates to another agent, it passes relevant context. But:

- Test interaction flows thoroughly to ensure context is passed clearly and handoffs behave as expected
- Receiving agents must be configured correctly to handle the queries or events passed to them
- If the receiving agent isn't designed to process a particular task, it returns incomplete or irrelevant responses — the parent doesn't validate this

### MCP Server Integration

Microsoft's adoption of Model Context Protocol (MCP) enables centralised tool orchestration with OAuth support for secure API connections. When working:

- Centralised execution simplifies multi-agent workflows compared to older distributed models
- OAuth support makes it possible to securely connect APIs, internal systems, and external services

When broken:

- MCP support and behaviour are tied to the orchestration runtime version, which you can't easily check or control
- No structured logs or developer mode showing exact tool invocation flow per agent
- Silent failures when MCP calls fail — conversation logs are opaque for tool execution

---

## Autonomous Agents and Event Triggers

Agents can be triggered by external events without user interaction:

- Scheduled triggers (time-based)
- Event-based triggers (e.g. Dataverse record update, email received)

### Key Constraints

- **Event-triggered agents use only the maker's credentials.** Tools called in response to a trigger must also use maker's credentials. This is a significant limitation — the agent operates with the permissions of whoever built it, not the end user.
- **Autonomous runs always consume Copilot Credits** regardless of user licensing. Even if all your users have M365 Copilot licences, scheduled/background agent runs are billed.
- **Event triggers can be blocked by DLP policy.** Admins can prevent makers from adding event triggers to agents.

### Design Guidance for Autonomous Agents

- Define expected sequences of actions for multi-step workflows
- Model each step with explicit preconditions, post-conditions, and numerical thresholds
- Design for idempotency with robust retry logic and dead-letter handling
- Incorporate approval gates through familiar channels (Teams, Outlook) for human-in-the-loop review
- Enforce least-privilege: scope connector permissions, use managed identities, apply MCP tool access policies
- Combine process instructions with specific prompts in the agent's instructions

---

## Declarative Agents for M365 Copilot

Declarative agents customise M365 Copilot for specific business scenarios via custom instructions, knowledge sources, and actions.

### Key Constraints for Declarative Agents

- **SharePoint and OneDrive knowledge sources require an active M365 Copilot licence.** If a user without a licence tries to use the agent, grounded retrieval fails silently with a generic runtime error.
- **Service principals not supported for SharePoint grounding.** The agent's connection must use User authentication.
- **CDX demo tenant accounts** without a Copilot licence can create and publish agents, but grounding fails silently.
- **Nested OpenAPI objects** in API method request bodies or parameters are not supported for API plugins. Use a flattened schema as a workaround.
- **Polymorphic references** (oneOf, allOf, anyOf) and circular references in OpenAPI specs are not supported.
- **OAuth grant flows** limited to vanilla Authcode and PKCE Authcode for API plugins.
- **Custom metadata queries on Copilot connectors** are not supported. "Get a list of ServiceNow tickets assigned to me" where "Assigned To" is custom metadata won't work because the field isn't mapped to connection schema label properties.
- **Links in responses** from any content source (SharePoint, connectors, plugins) may not render correctly — this is a known issue.

### Developer Licence for Testing

Use the **Microsoft 365 Copilot Developer License** for testing SharePoint grounding in non-production tenants. This includes the required Graph and SharePoint access that regular trial accounts lack.

---

## Settings That Matter

### Generative AI Settings

Access via Settings > Generative AI:

- **Orchestration mode:** Toggle between generative AI orchestration and classic orchestration. Changing this takes a while to apply — publish the agent after changing to confirm.
- **Deep reasoning:** Optional capability that enables more complex reasoning at higher credit cost. Evaluate whether your use case benefits before enabling.
- **Content moderation:** Built-in, cannot be tuned or overridden. Blocking reasons are not exposed.

### Authentication Settings

- **Authenticate with Microsoft** (default): Entra ID, limits to Teams/SharePoint/Power Apps/M365 Copilot
- **Authenticate manually:** Custom OAuth configuration
- **No authentication:** Anyone with link can chat. Block via DLP for production.

### Agent-Level Credit Caps

In the Power Platform admin center (Licensing > Copilot Studio > Manage Agents), set monthly consumption limits per agent to prevent runaway costs.

### Channel Description for Teams and M365 Copilot

The channel description provides instruction for intent recognition between domains. For multi-domain deployments (one agent covering HR and IT), the channel description ensures accurate intent routing and consistent user experience. This is separate from the main instructions field and specifically governs how the agent behaves in the Teams/M365 Copilot surface.

### Multi-Language Configuration

- Set primary and secondary languages for the agent
- In generative orchestration, the agent automatically determines user language from client/browser language
- Generated content is in the currently active language
- **Generative orchestration is currently English-only for the orchestration layer** — the planning and decision-making happens in English even if the agent responds in another language
