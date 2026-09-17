#!/usr/bin/env bash
set -euo pipefail

# Convenience wrapper to launch the pi-glider container. Operators may instead run
# the container however they see fit (see container/docker-compose.yml).
#
# Usage: ./scripts/pi-glider.sh [engagement-dir]
#   engagement-dir defaults to the current directory.
#
# Environment:
#   PI_GLIDER_CONFIG   host agentDir (default ~/.config/pi-glider)
#   PI_GLIDER_IMAGE    container image (default pi-glider:latest)
#   PI_GLIDER_BRIDGE   set to 0 to skip auto-starting the Burp MCP bridge
#   PI_GLIDER_BRIDGE_LOG  bridge log file (default $PI_GLIDER_CONFIG/bridge.log)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${PI_GLIDER_CONFIG:-$HOME/.config/pi-glider}"
ENGAGEMENT_DIR="${1:-$PWD}"
IMAGE="${PI_GLIDER_IMAGE:-pi-glider:latest}"
BRIDGE_LOG="${PI_GLIDER_BRIDGE_LOG:-$CONFIG_DIR/bridge.log}"

mkdir -p "$ENGAGEMENT_DIR/sessions"

# Burp's MCP server rejects non-localhost Host headers (DNS-rebinding protection), so the
# container reaches it through a Host-rewriting bridge on the host (see docs/architecture.md §5).
# Start it here if it isn't already running, and clean it up when this session ends.
BRIDGE_PID=""
if [ "${PI_GLIDER_BRIDGE:-1}" = "1" ] && ! pgrep -f "burp-mcp-bridge.py" >/dev/null 2>&1; then
  python3 "$REPO_ROOT/scripts/burp-mcp-bridge.py" >>"$BRIDGE_LOG" 2>&1 &
  BRIDGE_PID=$!
  sleep 0.5
  if kill -0 "$BRIDGE_PID" 2>/dev/null; then
    echo "[pi-glider] started burp-mcp-bridge (pid $BRIDGE_PID, log $BRIDGE_LOG)"
    trap 'kill "$BRIDGE_PID" 2>/dev/null || true' EXIT
  else
    echo "[pi-glider] WARNING: burp-mcp-bridge failed to start; see $BRIDGE_LOG" >&2
    BRIDGE_PID=""
  fi
elif [ "${PI_GLIDER_BRIDGE:-1}" = "1" ]; then
  echo "[pi-glider] burp-mcp-bridge already running"
fi

docker run --rm -it \
  -e PI_CODING_AGENT_DIR=/root/.pi/agent \
  -v "$CONFIG_DIR:/root/.pi/agent" \
  -v "$ENGAGEMENT_DIR:/engagement" \
  -v "$ENGAGEMENT_DIR/sessions:/root/.pi/agent/sessions" \
  --add-host=host.docker.internal:host-gateway \
  "$IMAGE"
