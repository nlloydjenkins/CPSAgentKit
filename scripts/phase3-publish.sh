#!/usr/bin/env bash
# scripts/phase3-publish.sh
#
# Runs the external-rollout (Phase 3) steps for the CPSAgentKit -> Agent
# Workbench rename. Every command is gated by DRY_RUN (default 1). To actually
# execute, run:
#
#   DRY_RUN=0 bash scripts/phase3-publish.sh
#
# You can also pass a single step name to run only that step:
#
#   DRY_RUN=0 bash scripts/phase3-publish.sh publish-npm
#
# Steps:
#   preflight      - npm whoami, compile, test, smoke
#   publish-npm    - npm publish @agent-workbench/{core,mcp-server}
#   deprecate-old  - npm deprecate @cpsagentkit/mcp-server (core was never published)
#   publish-vsix   - build + vsce publish the extension
#   github-desc    - gh repo edit description
#   tag-release    - git tag v1.0.0-agent-workbench + push
#
# Prerequisites:
#   - npm login (interactive; run separately before this script)
#   - The @agent-workbench scope is claimed by your npm user
#   - VSCE_PAT env var set to a Marketplace PAT with Manage scope, OR `vsce login` done
#   - gh CLI authenticated (`gh auth status` should be green)
#   - You are on a clean commit ready to tag (no unstaged changes)
#
# Run from repo root.

set -euo pipefail

DRY_RUN="${DRY_RUN:-1}"
STEP="${1:-all}"
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}-agent-workbench"

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[DRY] %s\n' "$*"
  else
    printf '[RUN] %s\n' "$*"
    "$@"
  fi
}

banner() { printf '\n=== %s ===\n' "$*"; }

step_preflight() {
  banner "preflight (v${VERSION}, dry-run=${DRY_RUN})"
  run npm whoami
  run npm install
  run npm run compile
  run npm test
  run node scripts/smoke-mcp.mjs
}

step_publish_npm() {
  banner "publish @agent-workbench/* to npm"
  # First-time publish of a new scope under your user account.
  # If your scope is org-owned, add --access public is still required for scoped packages.
  run npm publish --workspace @agent-workbench/core --access public
  run npm publish --workspace @agent-workbench/mcp-server --access public
}

step_deprecate_old() {
  banner "deprecate legacy @cpsagentkit/* on npm"
  # @cpsagentkit/core was never published (npm view returned 404), so no deprecate needed.
  run npm deprecate "@cpsagentkit/mcp-server" \
    "Renamed to @agent-workbench/mcp-server; install @agent-workbench/mcp-server instead."
}

step_publish_vsix() {
  banner "build + publish VSIX to VS Code Marketplace"
  # Build the renamed extension. If you want a version bump first, run one of:
  #   npm run build:patch   # 0.15.24 -> 0.15.25
  #   npm run build:minor   # 0.15.24 -> 0.16.0
  #   npm run build:major   # 0.15.24 -> 1.0.0  (recommended for the rename)
  #
  # `vsce publish` reads publisher/name from packages/extension/package.json and uploads.
  # Make sure $VSCE_PAT is set OR you've already run `vsce login <publisher>`.
  run npm run build:major
  run npx vsce publish --packagePath "releases/agent-workbench-${VERSION}.vsix" --no-dependencies
  # NOTE: shipping a final "deprecated" update for the OLD `cpsagentkit` Marketplace listing
  # is a separate operation. If the legacy listing was under the same publisher and you
  # haven't already changed its `name` field in this commit, you can't deprecate it via
  # `vsce`. Use the Marketplace publisher portal: open the old listing -> "..." ->
  # "Deprecate Extension" and point users at the new one.
  echo "[INFO] Don't forget to deprecate the OLD cpsagentkit Marketplace listing via the Marketplace publisher portal."
}

step_github_desc() {
  banner "update GitHub repo description"
  # Requires `gh` CLI authenticated as the repo owner / a user with admin rights.
  run gh repo edit nlloydjenkins/CPSAgentKit \
    --description "Agent Workbench for Copilot Studio — VS Code extension and MCP server to design, build, and ship Microsoft Copilot Studio agents." \
    --homepage "https://marketplace.visualstudio.com/items?itemName=<publisher>.agent-workbench"
}

step_tag_release() {
  banner "tag + push v1.0.0-agent-workbench"
  run git tag -a "${TAG}" -m "Rename to Agent Workbench for Copilot Studio (Phase 1-3)"
  run git push origin "${TAG}"
}

case "$STEP" in
  all)
    step_preflight
    step_publish_npm
    step_deprecate_old
    step_publish_vsix
    step_github_desc
    step_tag_release
    ;;
  preflight)     step_preflight ;;
  publish-npm)   step_publish_npm ;;
  deprecate-old) step_deprecate_old ;;
  publish-vsix)  step_publish_vsix ;;
  github-desc)   step_github_desc ;;
  tag-release)   step_tag_release ;;
  *)
    echo "Unknown step: $STEP"
    echo "Usage: DRY_RUN=0 bash scripts/phase3-publish.sh [preflight|publish-npm|deprecate-old|publish-vsix|github-desc|tag-release|all]"
    exit 1
    ;;
esac

printf '\nDone. (DRY_RUN=%s)\n' "$DRY_RUN"
