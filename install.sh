#!/usr/bin/env bash
# Install mermaid-all into the global OpenCode config directory.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CFG="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
PLUGINS="$CFG/plugins"
SHIMS="$CFG/shims"

echo "Installing mermaid-all into $CFG"

mkdir -p "$PLUGINS" "$SHIMS"

# 1. plugin directory
rm -rf "$PLUGINS/mermaid-all"
cp -r "$HERE" "$PLUGINS/mermaid-all"
rm -rf "$PLUGINS/mermaid-all/.git" "$PLUGINS/mermaid-all/node_modules" "$PLUGINS/mermaid-all/shims"

# 2. durable @opentui/core shim at the config level (must NOT live inside the plugin:
#    a plugin-local node_modules breaks resolution of the plugin's own bare imports)
rm -rf "$SHIMS/opentui-core"
cp -r "$HERE/shims/opentui-core" "$SHIMS/opentui-core"

# 3. merge required dependencies into $CFG/package.json
PKG="$CFG/package.json"
node - "$PKG" <<'NODE'
const fs = require("node:fs")
const file = process.argv[2]
let pkg = {}
try { pkg = JSON.parse(fs.readFileSync(file, "utf8")) } catch {}
pkg.dependencies = pkg.dependencies || {}
Object.assign(pkg.dependencies, {
  "@opencode-ai/plugin": "1.18.16",
  "@opencode/plugin": "2.0.22",
  "@opentui/core": "file:./shims/opentui-core",
  "entities": "7.0.1",
  "string-width": "^7.2.0",
})
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
console.log("Updated", file)
NODE

# 4. install dependencies
if command -v bun >/dev/null 2>&1; then
  ( cd "$CFG" && bun install )
else
  echo "bun not found: run 'bun install' in $CFG manually" >&2
fi

echo "Done. Restart OpenCode to load mermaid-all."
