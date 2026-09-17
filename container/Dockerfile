# pi-glider — Kali Linux container for the Pi pentest agent.
FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive \
    PI_CODING_AGENT_DIR=/root/.pi/agent \
    NODE_VERSION=22.12.0

# Base tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git unzip wget gnupg xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Node.js — official binary tarball (distro-agnostic; NodeSource is unreliable on Kali rolling)
RUN ARCH="$(dpkg --print-architecture)"; \
    case "$ARCH" in \
      amd64) N="linux-x64" ;; \
      arm64) N="linux-arm64" ;; \
      *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${N}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1

# Pi coding agent
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# pi-mcp-extension (MCP client) — baked into the image's global npm so it survives
# container teardown. Registration lives in config/settings.json (mounted at runtime).
RUN pi install npm:pi-mcp-extension

# pdtm (ProjectDiscovery Tool Manager)
COPY install/install-pdtm.sh /tmp/install-pdtm.sh
RUN bash /tmp/install-pdtm.sh

# Ensure pdtm + installed tools are on PATH (non-interactive build; no shell rc)
ENV PATH="/root/.pdtm/go/bin:${PATH}"

# Baseline ProjectDiscovery tools (not version-pinned; operators may add more at runtime)
COPY install/pdtm-tools.txt /tmp/pdtm-tools.txt
RUN while read -r t; do [ -z "$t" ] && continue; pdtm -i "$t"; done < /tmp/pdtm-tools.txt

WORKDIR /engagement

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
