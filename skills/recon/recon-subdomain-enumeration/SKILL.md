---
name: recon-subdomain-enumeration
description: Enumerate subdomains for in-scope targets using subfinder and uncover, with deduplication and structured output.
---

# Subdomain enumeration

Passive subdomain enumeration for in-scope root domains.

## Workflow

1. Confirm the root domain(s) are in scope per `/engagement/RoE.md`.
2. Run `subfinder` against each in-scope domain:

   ```bash
   subfinder -d example.com -o /engagement/recon/subdomains.example.com.txt
   ```

3. Optionally enrich with `uncover` (requires configured API keys) or resolve with `dnsx`.
4. Deduplicate and sort:

   ```bash
   sort -u /engagement/recon/subdomains.example.com.txt -o /engagement/recon/subdomains.example.com.txt
   ```

5. Optionally resolve to live/unique hosts:

   ```bash
   dnsx -l /engagement/recon/subdomains.example.com.txt -resp-only -o /engagement/recon/resolved.example.com.txt
   ```

## Output

- Raw results: `/engagement/recon/subdomains.<domain>.txt`
- Resolved hosts (optional): `/engagement/recon/resolved.<domain>.txt`

## Scope

- Only enumerate in-scope root domains.
- Newly discovered subdomains are candidates; confirm before active testing beyond passive
  enumeration.
