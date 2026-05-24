# Build stage — bundle the MCP server
FROM node:20-slim AS build
WORKDIR /build

# Copy monorepo root manifests and lockfile
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp-server/package.json packages/mcp-server/

# Install all workspace dependencies
RUN npm ci --workspace=packages/core --workspace=packages/mcp-server

# Copy source
COPY packages/core/ packages/core/
COPY packages/mcp-server/ packages/mcp-server/
COPY docs/ docs/
COPY scripts/copy-shared-assets.js scripts/copy-shared-assets.js

# Build core, then bundle the MCP server (includes copy-shared-assets prebuild)
RUN npm run compile --workspace=packages/core && \
    npm run bundle --workspace=packages/mcp-server

# Production stage — minimal runtime image
FROM node:20-slim
WORKDIR /app

COPY --from=build /build/packages/mcp-server/dist/ ./dist/
COPY --from=build /build/packages/mcp-server/resources/ ./resources/
COPY --from=build /build/packages/mcp-server/package.json ./

# Install only production dependencies (external: @modelcontextprotocol/sdk, zod)
RUN npm install --omit=dev --ignore-scripts && \
    npm cache clean --force

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/bin.js", "--transport=http", "--host=0.0.0.0", "--port=8080"]
