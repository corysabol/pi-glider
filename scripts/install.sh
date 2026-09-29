#!/usr/bin/env bash
set -euo pipefail

# Seed the live agentDir (~/.config/pi-glider) from the repo's config/ and skills/.
# Usage: ./scripts/install.sh [--force]

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${PI_GLIDER_CONFIG:-$HOME/.config/pi-glider}"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

echo "[pi-glider] seeding agentDir: $TARGET"

mkdir -p "$TARGET/skills" "$TARGET/prompts" "$TARGET/sessions" "$TARGET/extensions"

# Config templates (don't clobber operator edits unless --force)
for f in models.json mcp.json settings.json APPEND_SYSTEM.md methodology-tips.md context-inject.json; do
  if [ -f "$TARGET/$f" ] && [ "$FORCE" -ne 1 ]; then
    echo "  skip  $f (exists; use --force to overwrite)"
  else
    cp "$REPO_ROOT/config/$f" "$TARGET/$f"
    echo "  write $f"
  fi
done

# Optional full-replacement system prompt (SYSTEM.md); copy if present in the repo.
if [ -f "$REPO_ROOT/config/SYSTEM.md" ]; then
  if [ -f "$TARGET/SYSTEM.md" ] && [ "$FORCE" -ne 1 ]; then
    echo "  skip  SYSTEM.md (exists; use --force to overwrite)"
  else
    cp "$REPO_ROOT/config/SYSTEM.md" "$TARGET/SYSTEM.md"
    echo "  write SYSTEM.md"
  fi
fi

# Skills (copy repo skills over same-named; preserve operator-added skills)
cp -R "$REPO_ROOT/skills/." "$TARGET/skills/"
echo "  sync  skills/"

# Extensions (copy repo extensions over same-named; preserve operator-added extensions)
cp -R "$REPO_ROOT/extensions/." "$TARGET/extensions/"
echo "  sync  extensions/"

echo "[pi-glider] done. Edit $TARGET/models.json and $TARGET/mcp.json before first run."
