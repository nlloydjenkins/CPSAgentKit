# MCP Server Deployment

The `deploy-mcp.yml` workflow builds the [MCP server Dockerfile](../../packages/mcp-server/Dockerfile) and rolls out a new revision of the Azure Container App on every push to `main` that touches the server, its dependencies, or the bundled docs.

## Target infrastructure

The workflow assumes the Container Apps stack already exists. Current target (UK South):

| Component          | Name                   |
| ------------------ | ---------------------- |
| Resource group     | `rg-cpsagentkit-mcp`   |
| ACR                | `acr6frsoq6bw5vukcps`  |
| Container App      | `ca-mcp-6frsoq6bw5vuk` |
| Container Apps env | `cae-6frsoq6bw5vuk`    |
| Managed identity   | `id-6frsoq6bw5vuk`     |
| App Insights       | `appi-6frsoq6bw5vuk`   |
| Log Analytics      | `log-6frsoq6bw5vuk`    |

If any of these names change, update the GitHub **repo variables** below — no code change required.

## One-time GitHub setup

### Secrets (Settings → Secrets and variables → Actions → Secrets)

| Secret                  | Value                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`       | Client ID of the user-assigned MI / app registration used for OIDC. |
| `AZURE_TENANT_ID`       | Entra tenant ID.                                                    |
| `AZURE_SUBSCRIPTION_ID` | Subscription containing `rg-cpsagentkit-mcp`.                       |

The identity must have a **federated credential** trusting:

```
repo: <owner>/CPSAgentKit
subject: repo:<owner>/CPSAgentKit:ref:refs/heads/main
audience: api://AzureADTokenExchange
```

(Add a second federated credential for `event:workflow_dispatch` if you want manual runs.)

### Role assignments

Grant the identity these roles (least privilege):

```sh
# Push images to ACR
az role assignment create \
  --assignee <client-id> \
  --role AcrPush \
  --scope /subscriptions/<sub>/resourceGroups/rg-cpsagentkit-mcp/providers/Microsoft.ContainerRegistry/registries/acr6frsoq6bw5vukcps

# Update the Container App (revisions, image)
az role assignment create \
  --assignee <client-id> \
  --role "Container Apps Contributor" \
  --scope /subscriptions/<sub>/resourceGroups/rg-cpsagentkit-mcp/providers/Microsoft.App/containerApps/ca-mcp-6frsoq6bw5vuk
```

The Container App's own pull identity (the managed identity bound to its registry config) must have `AcrPull` on the ACR — already configured at provision time, no CI action needed.

### Variables (Settings → Secrets and variables → Actions → Variables)

| Variable                   | Default value          |
| -------------------------- | ---------------------- |
| `AZURE_RESOURCE_GROUP`     | `rg-cpsagentkit-mcp`   |
| `AZURE_CONTAINER_REGISTRY` | `acr6frsoq6bw5vukcps`  |
| `AZURE_CONTAINER_APP`      | `ca-mcp-6frsoq6bw5vuk` |

## What the workflow does

1. Checkout + Azure OIDC login.
2. `az acr login` against the target registry.
3. `docker build` from the monorepo root using `packages/mcp-server/Dockerfile`.
4. Push two tags: `cpsagentkit-mcp:<sha>` and `cpsagentkit-mcp:latest`.
5. `az containerapp update --image …:<sha>` with a `--revision-suffix sha-<short>` so each deploy is a new, traceable revision.
6. Print the live MCP endpoint (`https://<fqdn>/mcp`) as a workflow annotation.

## Rollback

Revisions are immutable and named after the commit SHA. To roll back:

```sh
az containerapp revision list \
  -g rg-cpsagentkit-mcp -n ca-mcp-6frsoq6bw5vuk -o table

az containerapp revision activate \
  -g rg-cpsagentkit-mcp -n ca-mcp-6frsoq6bw5vuk \
  --revision <previous-revision-name>
```

## Local smoke test before deploy

```sh
npm ci
npm run compile
npm run bundle:mcp
npm run smoke:mcp:bundle

# Optional: build/run the container locally
docker build -f packages/mcp-server/Dockerfile -t cpsagentkit-mcp:local .
docker run --rm -p 8080:8080 cpsagentkit-mcp:local
curl http://localhost:8080/mcp  # expect MCP handshake response
```

## Legacy App Service infra

`packages/mcp-server/infra/main.bicep` and `packages/mcp-server/azure.yaml` describe an Azure **App Service** topology from an earlier prototype. They are **not used** by the current deploy workflow and are kept only as reference. Either delete them or rewrite them to reflect the Container Apps stack when you next touch infra.
