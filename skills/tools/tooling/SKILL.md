---
name: tooling
description: |-
  Toolchain reference: which tool to use for a recon/testing task, the key flags, and the
  in-container integration (Caido proxy, output dirs, callable caido_*/browser_* tools). Load when
  unsure which tool fits a task or how to route/run a tool.
---

# Toolchain

The container ships the ProjectDiscovery suite (via pdtm) plus the Kali repos and a headless Caido
proxy. Match the task to the tool; run `tool -h` for the full flag list — the flags below are only
the ones that matter most, not exhaustive.

## Callable tools (prefer these first)

These are registered by extensions and callable directly — no CLI needed:

- **Caido** (`caido_*`): `caido_list_requests`, `caido_get_request`, `caido_get_response`,
  `caido_list_sitemap`, `caido_view_sitemap_entry` (read); `caido_send_request`,
  `caido_send_raw_request` (replay); `caido_list_findings`, `caido_create_finding` (findings);
  `caido_list_scopes`, `caido_add_scope` (scope); `caido_export_requests` (export).
- **Browser** (`browser_*`): `browser_navigate`, `browser_evaluate`, `browser_screenshot`,
  `browser_close` — headless Chromium proxied through Caido.

## Task → tool

| Task | Tool |
|---|---|
| Passive subdomain discovery | `subfinder`, `uncover` |
| DNS resolution / record enumeration | `dnsx` |
| Port scanning | `naabu` |
| HTTP probing / tech detection | `httpx` |
| Crawl + JS endpoint discovery | `katana` |
| Template-based vulnerability scanning | `nuclei` |
| TLS / certificate fingerprinting | `tlsx` |
| CDN / WAF / cloud detection | `cdncheck` |
| ASN / organization mapping | `asnmap` |
| CIDR expansion | `mapcidr` |
| OOB interaction (blind SSRF/RCE/DNS exfil) | `interactsh-client` |
| Sending notifications | `notify` |
| Chaining tool traffic through a proxy | `proxify` |

## Integration conventions (non-negotiable)

- **Proxy:** `http_proxy` / `https_proxy` / `ALL_PROXY` already point at Caido (`$CAIDO_PROXY_URL`),
  so proxy-aware tools route through it automatically. Loopback and inference hosts are in
  `NO_PROXY`.
- **Output:** write raw output under `/engagement/recon/`; never into the repo or `.pi/`.
- **HTTPS:** Caido's MITM CA is trusted (`REQUESTS_CA_BUNDLE` / `NODE_EXTRA_CA_CERTS`). If a tool
  still rejects it, add `-k` / `--insecure`.

## Quick flags

```text
subfinder  -d <domain> [-dL <file>] [-all] [-silent] [-o <file>]
uncover    -q '<query>' -e shodan,censys [-o <file>]        (keys in ~/.config/uncover/)
dnsx       -l <file> [-a -aaaa -cname -mx -ns -txt] [-resp] [-o <file>]
naabu      -list <file> -top-ports 1000 [-p 80,443] [-rate <n>] [-o <file>]
httpx      -l <file> -title -tech-detect -status-code -web-server [-follow-redirects] [-o <file>]
katana     -list <file> [-u <url>] -js-crawl -jc -d <depth> [-o <file>]
nuclei     -l <file> -severity low,medium,high,critical [-t <template>] [-tags <tag>] [-o <file>]
tlsx       -l <file> -san -cn -so [-o <file>]
cdncheck   -i <file> [-resp] [-o <file>]
asnmap     -i <file> [-org] [-o <file>]
mapcidr    -cidr <cidr> [-cidr-file <file>] [-o <file>]
interactsh-client  [-o <file>] [-json]
notify     -data <file> [-bulk]                            (providers in ~/.config/notify/)
proxify    -http-proxy <url> -addr 127.0.0.1:8888          (point tools at it with -proxy)
```

## Caido (in-container proxy)

A headless Caido runs as the sidecar capture point. UI/GraphQL on `$CAIDO_API_URL` (host port
5000), HTTP proxy on `$CAIDO_PROXY_URL`. Prefer the `caido_*` tools to read/replay/annotate
captured traffic. For raw GraphQL, auth as guest (`loginAsGuest` → `accessToken`) and send
`Authorization: Bearer <token>`.

## Playwright

Chromium is bundled and proxy-routed (`$CAIDO_CHROMIUM_ARGS`). Prefer the `browser_*` tools for
common flows; for complex multi-step scripting, write a Node script (`require('playwright')` works
via `NODE_PATH`) and route it through the same proxy args.
