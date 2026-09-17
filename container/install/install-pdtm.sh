#!/usr/bin/env bash
set -euo pipefail

# Install pdtm (ProjectDiscovery Tool Manager) by downloading the latest release binary.
# Installs to $HOME/.pdtm/go/bin (pdtm's default binary path).

ARCH="$(dpkg --print-architecture)"
case "$ARCH" in
  amd64) A="amd64" ;;
  arm64) A="arm64" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

VER="$(curl -fsSL https://api.github.com/repos/projectdiscovery/pdtm/releases/latest \
  | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')"
[ -n "$VER" ] || { echo "failed to resolve latest pdtm version" >&2; exit 1; }

mkdir -p "$HOME/.pdtm/go/bin"
curl -fsSL "https://github.com/projectdiscovery/pdtm/releases/download/${VER}/pdtm_${VER#v}_linux_${A}.zip" \
  -o /tmp/pdtm.zip
unzip -o /tmp/pdtm.zip -d "$HOME/.pdtm/go/bin"
rm -f /tmp/pdtm.zip

echo "[pdtm] installed ${VER}"
