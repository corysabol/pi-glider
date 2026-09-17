#!/usr/bin/env bash
set -euo pipefail

# Convenience wrapper to launch the pi-glider container. Operators may instead run
# the container however they see fit (see container/docker-compose.yml).
#
# Usage: ./scripts/pi-glider.sh [engagement-dir]
#   engagement-dir defaults to the current directory.

CONFIG_DIR="${PI_GLIDER_CONFIG:-$HOME/.config/pi-glider}"
ENGAGEMENT_DIR="${1:-$PWD}"
IMAGE="${PI_GLIDER_IMAGE:-pi-glider:latest}"

mkdir -p "$ENGAGEMENT_DIR/sessions"

docker run --rm -it \
  -e PI_CODING_AGENT_DIR=/root/.pi/agent \
  -v "$CONFIG_DIR:/root/.pi/agent" \
  -v "$ENGAGEMENT_DIR:/engagement" \
  -v "$ENGAGEMENT_DIR/sessions:/root/.pi/agent/sessions" \
  --add-host=host.docker.internal:host-gateway \
  "$IMAGE"
