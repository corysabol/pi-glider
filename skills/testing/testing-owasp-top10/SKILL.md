---
name: testing-owasp-top10
description: Begin a full OWASP Top 10 (2021) web application assessment — category checklist, testing order, and routing to the focused skills. Use for a broad "assess this app" task.
---

# OWASP Top 10 (2021) assessment

Entry point for a broad web assessment. Map first, then work through the categories with the
focused skills; confirm + document as you go (breadth over depth).

## Order of operations

1. **Map the app** → `testing-web-map` (endpoints, params, roles, API surface).
2. **Access control (A01) + auth (A07)** → `testing-access-control` — usually highest impact; do early.
3. **Injection (A03) + SSRF (A10)** → `testing-injection` (SQLi, XSS, command, SSTI, XXE, SSRF).
4. **Misconfig + crypto (A05/A02)** → `testing-misconfig`.
5. **Vulnerable components (A06)** → `testing-nuclei` (also check versions against advisories).
6. **Design / integrity / logging (A04/A08/A09)** — operator judgment; flag concrete observations
   to `/engagement/notes/` as you encounter them.

## Checklist

| # | Category | Skill / tool |
|---|----------|--------------|
| A01 | Broken Access Control | `testing-access-control` |
| A02 | Cryptographic Failures | `testing-misconfig` |
| A03 | Injection | `testing-injection` |
| A04 | Insecure Design | operator judgment (note in `notes/`) |
| A05 | Security Misconfiguration | `testing-misconfig` |
| A06 | Vulnerable & Outdated Components | `testing-nuclei` |
| A07 | Identification & Authentication Failures | `testing-access-control` |
| A08 | Software & Data Integrity Failures | operator judgment (note in `notes/`) |
| A09 | Security Logging & Monitoring Failures | operator judgment (note in `notes/`) |
| A10 | SSRF | `testing-injection` (SSRF section) |

## Scope

Confirm each finding once with evidence (`/engagement/evidence/<id>-<slug>.md`) and move on. If
this is an open-ended task, present the plan before active testing (see `pi-glider` Phase 2).
