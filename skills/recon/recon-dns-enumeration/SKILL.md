---
name: recon-dns-enumeration
description: Resolve and enumerate DNS records for in-scope domains using dnsx, including reverse lookups and wildcard checks.
---

# DNS enumeration

DNS record enumeration and resolution for in-scope domains.

## Workflow

1. Confirm domains are in scope per `/engagement/RoE.md`.
2. Resolve subdomains with `dnsx`:

   ```bash
   dnsx -l /engagement/recon/subdomains.example.com.txt -a -aaaa -cname -resp \
     -o /engagement/recon/dns.example.com.txt
   ```

3. Check for wildcard DNS (resolve a random subdomain; if it resolves, wildcard is present).
4. Reverse DNS on discovered IPs if in scope.

## Output

- `/engagement/recon/dns.<domain>.txt`

## Scope

- Only enumerate in-scope domains.
