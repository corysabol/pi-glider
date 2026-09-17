#!/usr/bin/env bash
set -euo pipefail

export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-/root/.pi/agent}"

# One-time install of the MCP extension into the (mounted) agentDir.
# The marker persists on the host so this only runs once per agentDir.
MARKER="$PI_CODING_AGENT_DIR/.pi-glider-extension-installed"
if [ ! -f "$MARKER" ]; then
  echo "[pi-glider] first run: installing pi-mcp-extension..."
  pi install npm:pi-mcp-extension
  touch "$MARKER"
fi

cd /engagement

exec pi "$@"
