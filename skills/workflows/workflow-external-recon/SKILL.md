---
name: workflow-external-recon
description: Full external recon sweep: subdomain, DNS, port, HTTP, fingerprint, and crawl for in-scope targets.
---

# External recon sweep

A reusable end-to-end external recon workflow.

## Sequence

1. `recon-subdomain-enumeration` — enumerate subdomains.
2. `recon-dns-enumeration` — resolve records.
3. `recon-cidr-scoping` — expand in-scope ranges to IPs.
4. `recon-port-scanning` — scan open ports.
5. `recon-http-probe` — probe live web hosts.
6. `recon-fingerprinting` — fingerprint technologies.
7. `recon-js-analysis` — crawl JS and endpoints.
8. `recon-cloud-infrastructure` — map CDN/ASN.

## Output

All output under `/engagement/recon/`, summarized in `notes/scope-summary.md`.

## Scope

Confirm scope at each step; stop and confirm before any active testing.
