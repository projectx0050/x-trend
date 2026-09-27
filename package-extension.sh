#!/usr/bin/env bash
# Builds the Chrome Web Store zip from an explicit allowlist, so website files,
# QA tools, and anything else in this repo can never end up in the extension.
# Usage: bash package-extension.sh   ->   dist/x-trend-<version>.zip
set -euo pipefail
cd "$(dirname "$0")"

FILES=(
  manifest.json
  background.js
  sidepanel.html
  sidepanel.css
  sidepanel.js
  icon16.png
  icon32.png
  icon48.png
  icon128.png
)

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/x-trend-${VERSION}.zip"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

for f in "${FILES[@]}"; do cp "$f" "$STAGE/"; done

# Safety checks: production backend only, no secrets.
if grep -q "localhost" "$STAGE/background.js" "$STAGE/manifest.json"; then
  echo "ERROR: localhost reference found; package must point at production." >&2; exit 1
fi
if grep -Eq "sk_(live|test)_|sk-ant-|whsec_|re_[A-Za-z0-9]{16}|SUPABASE_SERVICE" "$STAGE"/*; then
  echo "ERROR: something that looks like a secret is in the package." >&2; exit 1
fi

mkdir -p dist
rm -f "$OUT"
# Windows (Git Bash): built-in Compress-Archive. ponytail: add a `zip` branch if this ever runs on macOS/Linux.
powershell.exe -NoProfile -Command "Compress-Archive -Path '$(cygpath -w "$STAGE")\\*' -DestinationPath '$(cygpath -w "$PWD/$OUT")'"
echo "Built $OUT (${#FILES[@]} files)"
