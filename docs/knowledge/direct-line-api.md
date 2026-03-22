# CPS Direct Line API Access

How to connect to a Copilot Studio agent programmatically via the Direct Line API (Dataverse-backed, authenticated).

## App Registration (Azure CLI)

### 1. Create the app registration

```bash
az ad app create --display-name "<AppName>" --sign-in-audience AzureADMyOrg
```

### 2. Enable public client flows (required for device-code auth)

```bash
az ad app update --id "<APP_ID>" --is-fallback-public-client true
```

### 3. Register the Power Platform API service principal in your tenant (one-time)

```bash
az ad sp create --id "8578e004-a5c6-46e7-913e-12f58912df43"
```

Skip if the service principal already exists (the command will error with "already exists" — that's fine).

### 4. Create a service principal for your app

```bash
az ad sp create --id "<APP_ID>"
```

### 5. Add the `CopilotStudio.Copilots.Invoke` delegated permission

Scope ID `204440d3-c1d0-4826-b570-99eb6f5e2aeb` on the Power Platform API:

```bash
az ad app permission add \
  --id "<APP_ID>" \
  --api "8578e004-a5c6-46e7-913e-12f58912df43" \
  --api-permissions "204440d3-c1d0-4826-b570-99eb6f5e2aeb=Scope"
```

### 6. Grant admin consent

```bash
az ad app permission grant \
  --id "<APP_ID>" \
  --api "8578e004-a5c6-46e7-913e-12f58912df43" \
  --scope "CopilotStudio.Copilots.Invoke"
```

### 7. (Optional) Create a client secret

Only needed for confidential client flows — not required for device-code auth:

```bash
az ad app credential reset --id "<APP_ID>" --display-name "MySecret" --years 1
```

## API Pattern — Three Calls

### 1. Get a token

Use MSAL `PublicClientApplication` with device-code flow, scoped to `https://api.powerplatform.com/.default`.

Use a **persistent file-based token cache** so you only authenticate once. On subsequent runs, MSAL silently refreshes from the cached refresh token.

### 2. Create a conversation

```
POST https://<ENV_HOSTNAME>/copilotstudio/dataverse-backed/authenticated/bots/<BOT_SCHEMA_NAME>/conversations?api-version=2022-03-01-preview
```

Headers: `Authorization: Bearer <token>`

Returns a `conversationId`.

### 3. Execute a turn (send message + receive reply)

```
POST https://<ENV_HOSTNAME>/copilotstudio/dataverse-backed/authenticated/bots/<BOT_SCHEMA_NAME>/conversations/<CONVERSATION_ID>?api-version=2022-03-01-preview
```

Body:

```json
{ "activity": { "type": "message", "text": "<user message>" } }
```

Headers: `Authorization: Bearer <token>`

Returns the bot's reply synchronously in `activities[]`.

## Key Values

| Value             | Where to find it                                                                   |
| ----------------- | ---------------------------------------------------------------------------------- |
| `APP_ID`          | Output of `az ad app create` or Azure Portal → App registrations                   |
| `ENV_HOSTNAME`    | Power Platform admin center → Environment → URL (e.g., `org1234.crm.dynamics.com`) |
| `BOT_SCHEMA_NAME` | Copilot Studio → Agent → Details → Schema name                                     |
| `TENANT_ID`       | Azure Portal → Microsoft Entra ID → Overview                                       |

## Gotchas

- The scope is `CopilotStudio.Copilots.Invoke`, NOT the generic `Copilots.Invoke` — wrong scope gives a 403.
- Send and receive is a **single POST** to the conversation URL — there is no separate `/activities` endpoint for the Dataverse-backed API.
- The agent must be **published** in Copilot Studio before the Direct Line API can reach it (`LatestPublishedVersionNotFound` error otherwise).
- Token cache file should be gitignored.
- The `api-version=2022-03-01-preview` is current as of March 2026 — check Microsoft docs if you get unexpected 404s.
- Device-code flow requires the user to open a browser and enter a code — not suitable for fully unattended scenarios. Use client credentials flow with a secret for service-to-service.

## Python Dependencies

```
msal
requests
```

## Relevance to CPSAgentKit

This API enables programmatic testing of CPS agents outside the portal test pane. Potential uses:

- Automated test harness: send test utterances, capture responses, compare against expected outputs
- CI/CD integration: validate agent behaviour after `Apply Changes`
- Batch evaluation: run a suite of test cases and produce a pass/fail report
