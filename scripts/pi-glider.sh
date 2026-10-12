#!/usr/bin/env bash
set -euo pipefail

# Convenience wrapper that delegates to the canonical CLI (`scripts/pi-glider`). Kept for
# backward compatibility; prefer `pi-glider` (or `scripts/pi-glider`) directly.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$REPO_ROOT/scripts/pi-glider" "$@"
