#!/usr/bin/env bash
set -euo pipefail

export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-/root/.pi/agent}"

cd /engagement

exec pi "$@"
