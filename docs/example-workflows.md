# Example workflows

Two archetypal engagements, worked end-to-end, showing the actual prompts an operator types and
how each maps to a skill. Both start from the same setup; they diverge in *scope shape*:

- **Authenticated web application** — a single app the operator can log into. The work is
  stateful, credential-aware, and driven by the `testing-*` skills.
- **External host set** — a domain/CIDR range with no credentials. The work is passive-first,
  footprint mapping, driven by the `recon-*` skills.

> Prompts below use `/skill:<name> <prompt>`, which loads the skill *and* runs the prompt in the
> same turn. Everything after the skill name is the instruction. For an **open-ended** task the
> agent stops at a plan gate before any active testing; for a **directed** (bounded) step it does
> exactly that step and awaits the next.

---

## Common setup (both scenarios)

```bash
# 1. Initialize the engagement dir (creates recon/, evidence/, notes/, RoE.md, seeds .pi/)
pi-glider init ~/engagements/acme

# 2. Fill in RoE.md — scope, accounts, goals. This is your single control point.
$EDITOR ~/engagements/acme/RoE.md

# 3. Launch the agent (container mode; drop --no-container for host mode)
pi-glider ~/engagements/acme
```

The first task in either scenario is always to confirm scope and orientation:

```
/skill:pi-glider read RoE.md and summarize the in-scope targets and what testing is authorized
```

---

## Scenario 1 — Authenticated web application

Target: `app.acme-corp.com`, credentials `user1` and `admin` (from `RoE.md`). Goal is a copilot
assessment against the OWASP Top 10.

### 1. Map the application (statefully)

Before testing anything, build the application inventory — browsing logged-in and logged-out while
Caido captures traffic.

```
/skill:testing-web-map map app.acme-corp.com. Start with the unauthenticated surface, then log in
as user1 and re-map, then log in as admin and re-map. Note the API surface, roles, and parameters.
```

The agent crawls, probes API specs, logs in via the browser tools, and writes
`recon/app-map.md` (routes, endpoints → parameters, roles, tech stack).

### 2. Present a plan (open-ended gate)

```
/skill:pi-glider using the app-map, write a prioritized testing plan to notes/plan.md and present it
```

Review it, then steer:

```
proceed, but do access control first, then injection on the panels, skip anything requiring DoS
```

### 3. Access control (A01) — the highest-value check

Drive it with the two roles:

```
/skill:testing-access-control compare what user1 can access vs admin on the /api/* endpoints. Check
for IDOR on order IDs and any admin-only functions callable as user1.
```

### 4. Injection (A03) — directed steps on specific inputs

This is where the operator names the exact target:

```
/skill:testing-injection evaluate the /panel/foo page for XSS using the user1 account — confirm
reflection and execution in the browser
```

```
/skill:testing-injection fuzz the sort parameter of /api/orders?sort for SQLi. SQL error responses
are already confirmed, so go straight to reproducing a benign proof-of-concept
```

### 5. Misconfiguration (A05/A02) — cheap hygiene sweep

```
/skill:testing-misconfig check app.acme-corp.com for exposed files, default credentials, verbose
errors, security headers, and TLS weaknesses
```

### 6. Document and report

As findings are confirmed the agent writes `evidence/<id>-<slug>.md` on its own (reproduce once +
evidence, then move on — breadth over depth). Wrap up:

```bash
# findings are in ~/engagements/acme/evidence/, raw traffic in Caido at http://localhost:5000
```

---

## Scenario 2 — External host set (no credentials)

Target: `acme-corp.com` and its `/24` CIDR `203.0.113.0/24`, no accounts. Goal is an external
footprint map. This is passive-first and chunked one phase at a time.

### 1. Discovery — subdomains + DNS

```
/skill:recon-discovery enumerate subdomains for acme-corp.com, then resolve DNS records, and flag
wildcard DNS
```

Output: `recon/subdomains.acme-corp.com.txt`, `recon/dns.acme-corp.com.txt`.

### 2. Infrastructure — CIDR, cloud, ASN

```
/skill:recon-infrastructure expand 203.0.113.0/24 to IPs, then map CDN/WAF/cloud and ASN for the
live hosts
```

Output: `recon/ips.txt`, `recon/cdn.*.txt`, `recon/asn.txt`.

### 3. Scanning — open ports

```
/skill:recon-scanning scan the in-scope hosts for open ports and service banners
```

Output: `recon/ports.txt`.

### 4. Web — probe, fingerprint, JS

```
/skill:recon-web probe the live hosts, fingerprint technologies and TLS, and crawl JS endpoints to
map the web attack surface
```

Output: `recon/live.txt`, `recon/tls.txt`, `recon/js.txt`.

### 5. Plan-and-confirm before anything active

```
/skill:pi-glider using the recon from discovery through web, write notes/plan.md with what's worth
actively testing and present it
```

Then, only after sign-off, pivot into the web/API `testing-*` skills on the specific live apps that
look interesting (e.g. `testing-web-map` on the main portal — this is where it converges with
Scenario 1).

---

## Prompt → skill cheat sheet

| You want the agent to… | Prompt |
|---|---|
| Read/orient on scope | `/skill:pi-glider read RoE.md and summarize scope` |
| Map an app (stateful, creds) | `/skill:testing-web-map map <host> with roles X, Y` |
| Full OWASP Top 10 sweep | `/skill:testing-owasp-top10 assess <host>` |
| Access control / IDOR | `/skill:testing-access-control compare role A vs B on <endpoint>` |
| XSS / SQLi / command inj. | `/skill:testing-injection test <input> for <flaw>` |
| Misconfig / crypto / TLS | `/skill:testing-misconfig check <host>` |
| API inventory | `/skill:testing-api-map enumerate <api>` |
| API authz (BOLA/BFLA/BOPLA) | `/skill:testing-api-authz compare tokens on <endpoint>` |
| API auth (JWT/token) | `/skill:testing-api-authn inspect <token>` |
| Full API Top 10 sweep | `/skill:testing-api-top10 assess <api>` |
| Subdomains + DNS | `/skill:recon-discovery enumerate <domain>` |
| CIDR / cloud / ASN | `/skill:recon-infrastructure map <range>` |
| Ports | `/skill:recon-scanning scan <hosts>` |
| Probe / fingerprint / JS | `/skill:recon-web probe <hosts>` |
| Template scans (A06) | `/skill:testing-nuclei scan <hosts>` |
| Which tool/flag/integration | `/skill:tooling` |
