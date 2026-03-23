#!/bin/zsh
# Build and install a release of CPSAgentKit
# Usage: scripts/build-release.sh patch|minor|major

set -e

BUMP_TYPE="$1"
if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: $0 patch|minor|major"
  exit 1
fi

# Bump version in package.json (no git tag)
npm version "$BUMP_TYPE" --no-git-tag-version

# Read the new version
VERSION=$(node -p "require('./package.json').version")
echo "Version bumped to $VERSION"

# Update CURRENT_VERSION in config.ts
sed -i '' "s/const CURRENT_VERSION = \".*\"/const CURRENT_VERSION = \"$VERSION\"/" src/services/config.ts

# Compile
npm run compile

# Package into releases/
mkdir -p releases
npx vsce package -o "releases/cpsagentkit-$VERSION.vsix"

# Install the extension
code --install-extension "releases/cpsagentkit-$VERSION.vsix"

echo "Done: cpsagentkit-$VERSION installed"
