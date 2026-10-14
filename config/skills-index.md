# Skills index

Route each intent to the right skill. When a skill matches your current task, **load it with
`/skill:<name> <prompt>`** instead of improvising with raw commands. This index is injected at
session start; reload it with `/skill:pi-glider` if you lose it after compaction.

## Engagement lifecycle

- Start / initialize an engagement directory → `engagement-setup`
- Operating methodology for a network/web assessment (recon → plan → confirm → test → document) →
  `pi-glider` (core manual)
- Client-side Android (OWASP MASTG) assessment → `mastg-android`

## External recon

- Enumerate subdomains + resolve DNS records → `recon-discovery`
- Map CIDR ranges, cloud/CDN/WAF, and ASN → `recon-infrastructure`
- Scan for open ports and services → `recon-scanning`
- Probe live hosts, fingerprint web/TLS, crawl JS endpoints → `recon-web`

## Active testing

- Begin a broad web assessment (OWASP Top 10) → `testing-owasp-top10`
- Map an in-scope web application (endpoints, params, roles) → `testing-web-map`
- Test access control / authorization (IDOR, priv-esc) and authentication → `testing-access-control`
- Test injection flaws (SQLi, XSS, command, SSTI, XXE, SSRF) → `testing-injection`
- Test misconfiguration and crypto failures (default creds, headers, TLS) → `testing-misconfig`
- Run Nuclei vulnerability scans → `testing-nuclei`

## Tool reference

A single `tooling` skill covers the toolchain: which tool fits a task, the key flags, and the
in-container integration (Caido proxy, output dirs, `caido_*`/`browser_*` tools). Load it when
unsure which tool to use or how to route/run one. Prefer the callable `caido_*` and `browser_*`
tools for traffic and browser work rather than raw CLIs.

## Reading captured traffic

To inspect, replay, or annotate captured web traffic, use the Caido tools (`caido_list_requests`,
`caido_get_request`, `caido_get_response`, …) rather than guessing from raw logs — see `tooling`
for the proxy/API reference.
