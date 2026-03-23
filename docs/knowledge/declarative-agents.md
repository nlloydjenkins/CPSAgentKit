# CPS Declarative Agents for M365 Copilot

Declarative agents customise M365 Copilot for specific business scenarios via custom instructions, knowledge sources, and actions.

## Key Constraints

- **SharePoint and OneDrive knowledge sources require an active M365 Copilot licence.** If a user without a licence tries to use the agent, grounded retrieval fails silently with a generic runtime error ("Sorry, I wasn't able to respond").
- **Service principals not supported for SharePoint grounding.** The agent's connection must use User authentication.
- **CDX demo tenant accounts** without a Copilot licence can create and publish agents, but grounding fails silently at runtime.

## API Plugin Limitations

- **Nested OpenAPI objects** in API method request bodies or parameters are not supported. Use a flattened schema as a workaround.
- **Polymorphic references** (oneOf, allOf, anyOf) and circular references in OpenAPI specs are not supported.
- **API keys in custom headers, query parameters, or cookies** are not supported.
- **OAuth grant flows** limited to vanilla Authcode and PKCE Authcode only.
- **Dual authentication flows** (OAuth/Entra SSO + HTTP Bearer token) for a single API endpoint are not supported.
- **No Settings UI to reset "always allow" states.** Workaround: uninstall the app to reset.
- **Custom metadata queries on Copilot connectors** are not supported. Queries like "Get tickets assigned to me" where "Assigned To" is custom metadata won't work because the field isn't mapped to connection schema label properties.
- **Links in responses** from any content source (SharePoint, connectors, plugins) may not render correctly — known issue.

## Power Automate Flows as Actions

- Power Automate flows as declarative agent actions may not run reliably.
- Newly created flows may not appear in the Add Action interface even if the action counter reflects their presence.
- Workaround: edit the flow description on the flow details page outside of Copilot Studio to improve trigger success.

## Developer Licence for Testing

Use the **Microsoft 365 Copilot Developer License** for testing SharePoint grounding in non-production tenants. This includes the required Graph and SharePoint access that regular trial accounts lack.

## Purview DLP Integration

Agents published to M365 Copilot inherit Purview DLP controls:

- **Prompt protection (preview):** DLP policies can block Copilot from responding when user prompts contain sensitive information types (SITs) — credit card numbers, passport IDs, SSNs, etc.
- **Sensitivity label protection (GA):** Block Copilot from processing or summarising files and emails with specific sensitivity labels.
- Error messaging may not clearly explain why a response was blocked, particularly in Word, Excel, and PowerPoint.
