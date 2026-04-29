targetScope = 'resourceGroup'

@description('Primary region for all resources')
param location string = resourceGroup().location

@description('Unique environment name used to generate globally unique resource names')
param environmentName string

@description('App Service plan SKU')
param appServicePlanSku string = 'B1'

// Derived names
var resourceToken = toLower(uniqueString(resourceGroup().id, environmentName))
var appServicePlanName = 'plan-${resourceToken}'
var appServiceName = 'app-cpsagentkit-${resourceToken}'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  properties: {
    reserved: true
  }
  sku: {
    name: appServicePlanSku
  }
}

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appServiceName
  location: location
  kind: 'app,linux'
  tags: {
    'azd-service-name': 'mcp-server'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appCommandLine: 'node dist/bin.js --transport=http --host=0.0.0.0 --port=8080'
      alwaysOn: appServicePlanSku != 'F1'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
      ]
    }
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroup().name
output appServiceName string = appService.name
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output mcpEndpoint string = 'https://${appService.properties.defaultHostName}/mcp'
