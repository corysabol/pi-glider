# pi-glider — Kali Linux container for the Pi pentest agent.
FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive \
    PI_CODING_AGENT_DIR=/engagement/.pi

# Base tooling. libatomic1: newer Node (>= 22.x on arm64) links libatomic.so.1 for
# 128-bit atomics; without it `node` fails to load with "libatomic.so.1: cannot open".
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git unzip wget gnupg xz-utils openssl libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# Node.js — official binary tarball (distro-agnostic; NodeSource is unreliable on Kali rolling).
# Resolve the newest release at build time so the image always keeps pace with the latest
# Pi requirement (Pi 0.75+ needs Node >= 22.19.0) without a hand-maintained version pin.
RUN ARCH="$(dpkg --print-architecture)"; \
    case "$ARCH" in \
      amd64) N="linux-x64" ;; \
      arm64) N="linux-arm64" ;; \
      *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
    esac; \
    NODE_VERSION="$(curl -fsSL https://nodejs.org/dist/index.json \
      | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1)"; \
    echo "Installing Node ${NODE_VERSION} (${N})"; \
    curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${N}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1

# Pi coding agent
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# Playwright — headless browser automation for dynamic in-browser testing.
# Currently @latest (see docs/todo.md — flag for version pinning; the CLI and the
# downloaded Chromium build must stay matched).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_PATH=/usr/local/lib/node_modules

# Chromium runtime libraries via apt. We do NOT use `playwright install --with-deps`
# because its distro detection doesn't recognize kali-rolling and aborts.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
        libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
        libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libdbus-1-3 \
        libx11-6 libxcb1 libxext6 \
        fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Global playwright CLI + library (agent can call `playwright ...` or require() it via NODE_PATH)
RUN npm install -g --ignore-scripts playwright@latest
RUN npx playwright install chromium

# pdtm (ProjectDiscovery Tool Manager)
COPY install/install-pdtm.sh /tmp/install-pdtm.sh
RUN bash /tmp/install-pdtm.sh

# Ensure pdtm + installed tools are on PATH (non-interactive build; no shell rc)
ENV PATH="/root/.pdtm/go/bin:${PATH}"

# Baseline ProjectDiscovery tools (not version-pinned; operators may add more at runtime)
COPY install/pdtm-tools.txt /tmp/pdtm-tools.txt
# Install ALL project discovery tools
RUN pdtm -ia
#RUN while read -r t; do [ -z "$t" ] && continue; pdtm -i "$t"; done < /tmp/pdtm-tools.txt

# Setup Caido — headless instance in the container; the operator connects to the web UI
# from the host browser.
ARG CAIDO_VERSION=0.56.0
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        CAIDO_ARCH="x86_64"; \
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        CAIDO_ARCH="aarch64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    wget -O caido-cli.tar.gz "https://caido.download/releases/v${CAIDO_VERSION}/caido-cli-v${CAIDO_VERSION}-linux-${CAIDO_ARCH}.tar.gz" && \
    tar -xzf caido-cli.tar.gz && \
    chmod +x caido-cli && \
    rm caido-cli.tar.gz && \
    mv caido-cli /usr/local/bin/

# Static CA used for Caido's MITM interception. Baked into the image so Caido
# (--import-ca-cert) and the container's system trust store agree on the SAME root,
# letting curl/python/ProjectDiscovery tools decrypt HTTPS through the proxy without
# `-k`. Playwright Chromium still passes --ignore-certificate-errors as a safety net
# (see $CAIDO_CHROMIUM_ARGS).
RUN mkdir -p /app/certs && \
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
      -nodes -sha256 \
      -keyout /app/certs/ca.key -out /app/certs/ca.crt \
      -days 3650 -subj "/CN=pi-glider Caido CA" && \
    openssl pkcs12 -export -out /app/certs/ca.p12 \
      -inkey /app/certs/ca.key -in /app/certs/ca.crt -passout pass: && \
    cp /app/certs/ca.crt /usr/local/share/ca-certificates/pi-glider-caido.crt && \
    update-ca-certificates --fresh


# Caido web-proxy sidecar (started by entrypoint.sh) — single capture point for all
# web traffic: browsers + CLI tools proxy through CAIDO_PROXY_URL; the operator reaches
# the UI/API on host port 5000 (published by scripts/pi-glider).
ENV CAIDO_DATA=/engagement/.caido \
    CAIDO_UI_PORT=5000 \
    CAIDO_PROXY_PORT=8080 \
    CAIDO_API_URL=http://127.0.0.1:5000 \
    CAIDO_PROJECT_NAME=engagement \
    CAIDO_PROXY_URL=http://127.0.0.1:8080 \
    CAIDO_CA_P12=/app/certs/ca.p12 \
    CAIDO_CERT_PASS="" \
    CAIDO_NO_PROXY=localhost,127.0.0.1,host.docker.internal,registry.npmjs.org \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    NODE_EXTRA_CA_CERTS=/app/certs/ca.crt \
    CAIDO_CHROMIUM_ARGS="--proxy-server=http://127.0.0.1:8080 --ignore-certificate-errors --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage"

WORKDIR /engagement

COPY caido-init.js /usr/local/bin/caido-init.js

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
