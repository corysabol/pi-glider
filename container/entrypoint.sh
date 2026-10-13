#!/usr/bin/env bash
set -euo pipefail

export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-/engagement/.pi}"

cd /engagement

# --- Caido web proxy sidecar ---------------------------------------------
# One instance per container is the single point of capture for all web traffic:
#   UI/API/GraphQL → CAIDO_UI_PORT    (operator host browser / desktop client connects here)
#   HTTP(S) proxy  → CAIDO_PROXY_PORT (Playwright, curl, ProjectDiscovery tools, ...)
# --allow-guests lets tooling authenticate via GraphQL `loginAsGuest` (see Strix's
# caido_bootstrap for the same pattern) — no OTP/user setup needed.
# NOTE: we do NOT pass --invisible. Invisible mode makes *every* listener act as a
# transparent proxy, which would route the operator's http://localhost:5000 request
# through the proxy instead of serving the Caido UI. Every client here is proxy-aware
# (Chromium --proxy-server, curl -x / http_proxy, Python requests), so transparent
# proxying isn't required.
# --import-ca-cert binds Caido's MITM CA to the image's baked root (see Dockerfile) so
# HTTPS interception is trusted by the system trust store / $REQUESTS_CA_BUNDLE.
CAIDO_DATA="${CAIDO_DATA:-/engagement/.caido}"
CAIDO_UI_PORT="${CAIDO_UI_PORT:-5000}"
CAIDO_PROXY_PORT="${CAIDO_PROXY_PORT:-8080}"
CAIDO_CERT_PASS="${CAIDO_CERT_PASS:-}"
CAIDO_CERTS="${CAIDO_DATA}/certs"
CAIDO_CA_KEY="${CAIDO_CERTS}/ca.key"
CAIDO_CA_CRT="${CAIDO_CERTS}/ca.crt"
CAIDO_CA_P12="${CAIDO_CERTS}/ca.p12"

mkdir -p "$CAIDO_DATA" "$CAIDO_CERTS" /var/log

# Persist the MITM CA in the engagement's Caido data dir so it survives image rebuilds
# and container teardowns (a rebuild otherwise ships a fresh CA, breaking trust
# continuity). Generate once on first run; reuse on later runs.
if [ ! -s "$CAIDO_CA_CRT" ] || [ ! -s "$CAIDO_CA_KEY" ]; then
  echo "[entrypoint] generating persistent Caido MITM CA ($CAIDO_CERTS)"
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -nodes -sha256 \
    -keyout "$CAIDO_CA_KEY" -out "$CAIDO_CA_CRT" \
    -days 3650 -subj "/CN=pi-glider Caido CA"
fi
if [ ! -s "$CAIDO_CA_P12" ]; then
  openssl pkcs12 -export -out "$CAIDO_CA_P12" \
    -inkey "$CAIDO_CA_KEY" -in "$CAIDO_CA_CRT" -passout "pass:${CAIDO_CERT_PASS}"
fi

# Install the persisted CA into the system trust store at runtime (the image no longer
# bakes one), so curl/python/node trust Caido's MITM cert without `-k`.
cp "$CAIDO_CA_CRT" /usr/local/share/ca-certificates/pi-glider-caido.crt
update-ca-certificates --fresh

caido-cli --no-open --allow-guests \
  --data-path "$CAIDO_DATA" \
  --listen "0.0.0.0:${CAIDO_UI_PORT}" \
  --proxy-listen "0.0.0.0:${CAIDO_PROXY_PORT}" \
  --import-ca-cert "$CAIDO_CA_P12" \
  --import-ca-cert-pass "$CAIDO_CERT_PASS" \
  >/var/log/caido.log 2>&1 &

# Wait for Caido readiness (loginAsGuest doubles as the healthcheck probe).
ready=0
for _ in $(seq 1 30); do
  if curl -fsS -X POST -H 'Content-Type: application/json' \
      -d '{"query":"mutation { loginAsGuest { token { accessToken } } }"}' \
      "http://127.0.0.1:${CAIDO_UI_PORT}/graphql" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" = 1 ]; then
  # Ensure a named project exists AND is selected so captured traffic has a home.
  node /usr/local/bin/caido-init.js || echo "[entrypoint] WARNING: caido-init failed; proxy traffic may not be captured" >&2
  echo "[entrypoint] Caido up — UI: http://localhost:${CAIDO_UI_PORT} | proxy: http://127.0.0.1:${CAIDO_PROXY_PORT} (data: ${CAIDO_DATA})"
else
  echo "[entrypoint] WARNING: Caido did not become ready in 30s; see /var/log/caido.log" >&2
fi

# --- System-wide proxy configuration ---------------------------------------
# Route every proxy-aware client (curl, wget, python/requests, node, ProjectDiscovery
# tools) through Caido WITHOUT per-tool flags, the same way Strix does. Loopback, the
# host control plane, and npm's registry are excluded via NO_PROXY so tooling's own
# calls don't recurse through (or pollute/block) the proxy.
#
# LLM inference is also kept OFF the proxy: MITM'ing streaming inference responses
# through Caido truncates them. We derive the operator's inference host(s) from
# models.json and add them to NO_PROXY automatically (CAIDO_NO_PROXY stays
# operator-extensible for any other hosts to bypass).
# NODE_EXTRA_CA_CERTS gives Node-based tools (npm/pi/playwright) the same trust in
# Caido's MITM CA that curl/python get via REQUESTS_CA_BUNDLE.
CAIDO_NO_PROXY="${CAIDO_NO_PROXY:-localhost,127.0.0.1,host.docker.internal,registry.npmjs.org}"

# Derive the inference baseUrl host(s) from models.json and exclude them from the proxy.
INFERENCE_NO_PROXY="$(node -e '
  const fs = require("fs");
  const p = (process.env.PI_CODING_AGENT_DIR || "/engagement/.pi") + "/models.json";
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(p, "utf8")); } catch { process.exit(0); }
  const hosts = new Set();
  (function walk(o) {
    if (o && typeof o === "object") {
      if (typeof o.baseUrl === "string") {
        try {
          const u = new URL(o.baseUrl);
          if (u.hostname && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
            hosts.add(u.port ? u.hostname + ":" + u.port : u.hostname);
          }
        } catch {}
      }
      for (const k in o) walk(o[k]);
    }
  })(cfg);
  console.log([...hosts].join(","));
' 2>/dev/null || true)"

if [ -n "$INFERENCE_NO_PROXY" ]; then
  echo "[entrypoint] inference host(s) bypass proxy: ${INFERENCE_NO_PROXY}"
  CAIDO_NO_PROXY="${CAIDO_NO_PROXY},${INFERENCE_NO_PROXY}"
fi

CAIDO_PROXY_URI="http://127.0.0.1:${CAIDO_PROXY_PORT}"

# (1) /etc/profile.d — sourced by login shells (`bash -lc`), which reset PATH on Kali.
cat > /etc/profile.d/proxy.sh <<EOF
export http_proxy=${CAIDO_PROXY_URI}
export https_proxy=${CAIDO_PROXY_URI}
export HTTP_PROXY=${CAIDO_PROXY_URI}
export HTTPS_PROXY=${CAIDO_PROXY_URI}
export ALL_PROXY=${CAIDO_PROXY_URI}
export NO_PROXY=${CAIDO_NO_PROXY}
export no_proxy=${CAIDO_NO_PROXY}
export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
export NODE_EXTRA_CA_CERTS=${CAIDO_CA_CRT}
EOF

# (2) /etc/wgetrc — wget's own proxy defaults, independent of the environment.
cat > /etc/wgetrc <<EOF
use_proxy=yes
http_proxy=${CAIDO_PROXY_URI}
https_proxy=${CAIDO_PROXY_URI}
no_proxy=${CAIDO_NO_PROXY}
EOF

# (3) Export into this process tree so `pi` and every child (shells, tools, the
#     Playwright MCP child, ...) inherit them regardless of login-shell behavior.
export http_proxy="${CAIDO_PROXY_URI}"
export https_proxy="${CAIDO_PROXY_URI}"
export HTTP_PROXY="${CAIDO_PROXY_URI}"
export HTTPS_PROXY="${CAIDO_PROXY_URI}"
export ALL_PROXY="${CAIDO_PROXY_URI}"
export NO_PROXY="${CAIDO_NO_PROXY}"
export no_proxy="${CAIDO_NO_PROXY}"
export REQUESTS_CA_BUNDLE="/etc/ssl/certs/ca-certificates.crt"
export SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt"
export NODE_EXTRA_CA_CERTS="${CAIDO_CA_CRT}"

echo "[entrypoint] proxy configured — http(s)_proxy/ALL_PROXY → ${CAIDO_PROXY_URI}; NO_PROXY=${CAIDO_NO_PROXY}"

exec pi "$@"
