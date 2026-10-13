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

- Enumerate subdomains → `recon-subdomain-enumeration`
- Resolve / enumerate DNS records → `recon-dns-enumeration`
- Scan for open ports and services → `recon-port-scanning`
- Probe live HTTP hosts and crawl the web surface → `recon-http-probe`
- Fingerprint web technologies and TLS → `recon-fingerprinting`
- Extract JavaScript files and endpoints → `recon-js-analysis`
- Map cloud / CDN / ASN infrastructure → `recon-cloud-infrastructure`
- Expand and validate CIDR ranges for scope → `recon-cidr-scoping`
- Full external sweep (subdomain → DNS → port → HTTP → fingerprint → crawl) in one pass →
  `workflow-external-recon`

## Active testing

- Run Nuclei vulnerability scans → `testing-nuclei`

## Tool reference (exact CLI flags for one tool)

| Intent | Skill |
|--------|-------|
| Passive subdomain enumeration | `tools-subfinder` |
| Fast port scanning | `tools-naabu` |
| HTTP probing / tech detection | `tools-httpx` |
| Web crawling / endpoint + JS discovery | `tools-katana` |
| Template-based vulnerability scanning | `tools-nuclei` |
| Fast DNS resolution / record enumeration | `tools-dnsx` |
| Query search engines/APIs for hosts | `tools-uncover` |
| TLS fingerprinting / cert inspection | `tools-tlsx` |
| Detect CDN / WAF / cloud providers | `tools-cdncheck` |
| Map IPs/domains to ASN / org | `tools-asnmap` |
| Expand/filter CIDR ranges | `tools-mapcidr` |
| OOB interaction testing (callbacks) | `tools-interactsh-client` |
| Send notifications from tool output | `tools-notify` |
| Route tool traffic through a proxy | `tools-proxify` |
| In-container Caido proxy + GraphQL API | `tools-caido` |
| Playwright/Chromium dynamic browser testing | `tools-playwright` |

## Reading captured traffic

To inspect, replay, or annotate captured web traffic, use the Caido tools (`caido_list_requests`,
`caido_get_request`, `caido_get_response`, …) rather than guessing from raw logs — see
`tools-caido` for the proxy/API reference.
