---
name: recon-discovery
description: Enumerate an in-scope domain's external footprint — subdomains then DNS resolution — for passive discovery. Use as the first recon step before probing or scanning.
---

# External discovery (subdomains + DNS)

Passive enumeration of the hosts behind an in-scope domain.

## Workflow

1. Confirm the root domain(s) are in scope per `/engagement/RoE.md`.
2. Enumerate subdomains:

   ```bash
   subfinder -d example.com -o /engagement/recon/subdomains.example.com.txt
   # optionally enrich with uncover (requires API keys)
   ```

3. Deduplicate and sort:

   ```bash
   sort -u /engagement/recon/subdomains.example.com.txt -o /engagement/recon/subdomains.example.com.txt
   ```

4. Resolve records; check for wildcard DNS (resolve a random `*.example.com`; if it resolves, the
   domain wildcards):

   ```bash
   dnsx -l /engagement/recon/subdomains.example.com.txt \
     -a -aaaa -cname -resp -o /engagement/recon/dns.example.com.txt
   ```

5. Optionally reduce to unique resolved IPs with `dnsx -l <file> -resp-only`.

## Output

- `/engagement/recon/subdomains.<domain>.txt`
- `/engagement/recon/dns.<domain>.txt`

## Scope

Only in-scope domains. Discovered subdomains are candidates, not automatically in scope — confirm
before active testing.
