targetScope = 'resourceGroup'

@description('Primary region for all resources.')
param location string = resourceGroup().location

@description('Unique environment name used to generate globally-unique resource names. Provide via azd or -p environmentName=...')
param environmentName string

@description('Container image reference (e.g. <acr>.azurecr.io/cpsagentkit-mcp:0.15.23). Defaults to a public mcr hello-world placeholder so the first deploy can stand up the registry before any image has been pushed.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Optional API key required by the MCP server. Leave empty for an anonymous endpoint (the data exposed by this server is non-sensitive).')
@secure()
param mcpApiKey string = ''

@description('Min replicas. 0 enables scale-to-zero.')
@minValue(0)
param minReplicas int = 0

@description('Max replicas.')
@minValue(1)
param maxReplicas int = 3

@description('Tags applied to every resource.')
param tags object = {
  'azd-env-name': environmentName
  application: 'cpsagentkit-mcp'
}

// ── Names ────────────────────────────────────────────────────────────────────
var resourceToken = toLower(uniqueString(resourceGroup().id, environmentName))
var lawName = 'log-${resourceToken}'
var aiName = 'appi-${resourceToken}'
// ACR name: 5-50 lowercase alphanumerics
var acrName = take('acr${resourceToken}cps', 50)
var uamiName = 'id-${resourceToken}'
var envName = 'cae-${resourceToken}'
var appName = 'ca-mcp-${resourceToken}'

// ── Log Analytics + Application Insights ─────────────────────────────────────
resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: lawName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: aiName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: law.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ── User-assigned managed identity ───────────────────────────────────────────
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: uamiName
  location: location
  tags: tags
}

// ── Azure Container Registry ─────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    anonymousPullEnabled: false
  }
}

// AcrPull role for the managed identity on the registry.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, acrPullRoleId)
  scope: acr
  properties: {
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

// ── Container Apps environment ───────────────────────────────────────────────
resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

// ── Container App ────────────────────────────────────────────────────────────
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: union(tags, {
    'azd-service-name': 'mcp-server'
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uami.id}': {}
    }
  }
  dependsOn: [
    acrPullAssignment
  ]
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            weight: 100
            latestRevision: true
          }
        ]
        corsPolicy: {
          allowedOrigins: [
            '*'
          ]
          allowedMethods: [
            'GET'
            'POST'
            'DELETE'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
        }
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: uami.id
        }
      ]
      secrets: concat(
        [
          {
            name: 'appinsights-connection-string'
            value: appInsights.properties.ConnectionString
          }
        ],
        empty(mcpApiKey)
          ? []
          : [
              {
                name: 'mcp-api-key'
                value: mcpApiKey
              }
            ]
      )
    }
    template: {
      containers: [
        {
          name: 'mcp-server'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat(
            [
              {
                name: 'MCP_HOSTED'
                value: '1'
              }
              {
                name: 'NODE_ENV'
                value: 'production'
              }
              {
                name: 'PORT'
                value: '8080'
              }
              {
                name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
                secretRef: 'appinsights-connection-string'
              }
            ],
            empty(mcpApiKey)
              ? []
              : [
                  {
                    name: 'MCP_API_KEY'
                    secretRef: 'mcp-api-key'
                  }
                ]
          )
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroup().name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.properties.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = acr.name
output AZURE_CONTAINER_APP_NAME string = containerApp.name
output AZURE_CONTAINER_APP_ENV string = managedEnv.name
output AZURE_USER_ASSIGNED_IDENTITY_ID string = uami.id
output AZURE_USER_ASSIGNED_IDENTITY_CLIENT_ID string = uami.properties.clientId
output APPLICATIONINSIGHTS_CONNECTION_STRING string = appInsights.properties.ConnectionString
output mcpEndpoint string = 'https://${containerApp.properties.configuration.ingress.fqdn}/mcp'
output appFqdn string = containerApp.properties.configuration.ingress.fqdn
