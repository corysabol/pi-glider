# pi-glider — Kali Linux container for the Pi pentest agent.
FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive \
    PI_CODING_AGENT_DIR=/root/.pi/agent

# Base tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git unzip wget gnupg \
    && rm -rf /var/lib/apt/lists/*

# Node.js (required by Pi)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Pi coding agent
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# pdtm (ProjectDiscovery Tool Manager)
RUN curl -fsSL https://pdtm.sh/api/install.sh | sh

# Baseline ProjectDiscovery tools (not version-pinned; operators may add more at runtime).
# NOTE: verify the exact pdtm install flag during the smoke test.
COPY install/pdtm-tools.txt /tmp/pdtm-tools.txt
RUN while read -r t; do [ -z "$t" ] && continue; pdtm -i "$t"; done < /tmp/pdtm-tools.txt

WORKDIR /engagement

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
