---
name: tools-caido
description: |-
  Caido web proxy sidecar running inside the container. All browser and HTTP tool traffic must
  flow through it. Reference for proxy URLs, tool -proxy flags, and the GraphQL API (guest token).
---

# Caido (in-container proxy)

A `caido-cli` instance runs as a sidecar, started by the container entrypoint. It is the
single capture point for the engagement: every browser and HTTP-tool request should appear
in Caido so the operator sees the same traffic you do.

- Proxy: `$CAIDO_PROXY_URL` (default `http://127.0.0.1:8080`)
- UI/API/GraphQL: `$CAIDO_API_URL` (default `http://127.0.0.1:5000`; published to host
  port 5000 — the operator connects their desktop Caido or a browser there)
- Data persists per engagement at `$CAIDO_DATA` (`/engagement/.caido`)
- Instance log: `/var/log/caido.log`

## Route tool traffic through the proxy

The entrypoint exports `http_proxy` / `https_proxy` / `HTTP_PROXY` / `HTTPS_PROXY` /
`ALL_PROXY` (pointed at `$CAIDO_PROXY_URL`) and sets `NO_PROXY` to `$CAIDO_NO_PROXY`
(`localhost,127.0.0.1,host.docker.internal,registry.npmjs.org` — the npm registry is excluded so
runtime `npm install` of extensions isn't routed through the proxy), so proxy-aware tools (`curl`, `wget`,
`python`/`requests`, ProjectDiscovery tools, `node`) route through Caido **automatically**
without per-tool flags. The `-proxy`/`-x` flags below remain valid if you must be explicit.

- curl: `curl -x "$CAIDO_PROXY_URL" ...`
- httpx: `httpx -proxy "$CAIDO_PROXY_URL" ...`
- katana: `katana -proxy-url "$CAIDO_PROXY_URL" ...`
- ffuf: `ffuf -x "$CAIDO_PROXY_URL" ...`
- nuclei: `nuclei -proxy-url "$CAIDO_PROXY_URL" ...`
- Playwright/Chromium: see the `tools-playwright` skill (uses `$CAIDO_CHROMIUM_ARGS`).

HTTPS interception uses the image's baked CA (installed in the system trust store and set via
`$REQUESTS_CA_BUNDLE`/`$SSL_CERT_FILE`), so TLS-intercepted HTTPS usually works **without** `-k`.
If a tool still rejects the cert, add `-k`/`--insecure`.

Caveat: Chromium bypasses the proxy for loopback (`http://127.0.0.1`, `http://localhost`)
targets by default. If the target app is served locally, add
`--proxy-bypass-list=\<-loopback\>` to force loopback through Caido too.

## GraphQL API (programmatic access)

Auth = guest token (instance runs with `--allow-guests`):

```bash
TOKEN=*** -s -X POST "$CAIDO_API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"mutation { loginAsGuest { token { accessToken } } }"}' \
  | jq -r .data.loginAsGuest.token.accessToken)
```

Send subsequent GraphQL calls with
`-H "Authorization: Bearer $TOKEN"`. Useful operations (0.56 schema — verify with `__type` introspection if in doubt):

- Projects (plain list, not a connection): `{ projects { id name temporary } }`
- Create a project: `mutation { createProject(input: { name: "target" }) { project { id name } } }`
- Select the active project (proxy binds captures to the selected project):
  `mutation { selectProject(id: "<id>") }`
- Captured requests: `{ requests { edges { node { id method host path isTls } } } }`
  (note: `method`, not `httpMethod`)

The entrypoint already creates + selects a project named `$CAIDO_PROJECT_NAME`
(default "engagement"), so captured traffic always has a home.

Keep API use light (queries, project/scope management); deep request replay and scanning
via the API is operator-driven.
