---
name: testing-api-top10
description: Begin a full OWASP API Security Top 10 (2023) assessment — category checklist, testing order, and routing to the focused API/web skills. Use for a broad "assess this API" task.
---

# OWASP API Security Top 10 (2023) assessment

Entry point for a broad API assessment. Map first, then work through the categories with the
focused skills; confirm + document as you go (breadth over depth).

## Order of operations

1. **Inventory the API** → `testing-api-map` (endpoints, methods, auth scheme, versions, roles).
2. **Authorization (API1/5/3)** → `testing-api-authz` — BOLA/BFLA/BOPLA; the dominant API risk.
3. **Authentication (API2)** → `testing-api-authn`.
4. **SSRF (API7)** → `testing-injection` (SSRF section) — SSRF is an injection flaw.
5. **Misconfiguration (API8)** → `testing-misconfig`.
6. **Consumption / business flows (API4/6) + third-party/design (API10)** — operator judgment;
   flag concrete observations (missing rate limits, sensitive multi-step flows) to
   `/engagement/notes/`.

## Checklist

| # | Category | Skill / tool |
|---|----------|--------------|
| API1 | Broken Object Level Authorization (BOLA) | `testing-api-authz` |
| API2 | Broken Authentication | `testing-api-authn` |
| API3 | Broken Object Property Level Authorization (BOPLA) | `testing-api-authz` |
| API4 | Unrestricted Resource Consumption | operator judgment (rate-limit note) |
| API5 | Broken Function Level Authorization (BFLA) | `testing-api-authz` |
| API6 | Unrestricted Access to Sensitive Business Flows | operator judgment (note in `notes/`) |
| API7 | Server-Side Request Forgery | `testing-injection` (SSRF section) |
| API8 | Security Misconfiguration | `testing-misconfig` |
| API9 | Improper Inventory Management | `testing-api-map` |
| API10 | Unsafe Consumption of Third-Party APIs | operator judgment (note in `notes/`) |

## Scope

Confirm each finding once with evidence (`/engagement/evidence/<id>-<slug>.md`) and move on. If
this is an open-ended task, present the plan before active testing (see `pi-glider` Phase 2).
