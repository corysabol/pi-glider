---
name: recon-infrastructure
description: Map an in-scope target's infrastructure — expand CIDR ranges to IPs, then map CDN/WAF/cloud and ASN — to understand hosting and scope boundaries.
---

# Infrastructure mapping (CIDR + cloud/ASN)

Scope and hosting context for in-scope targets.

## Workflow

1. Expand in-scope CIDR ranges to an IP list:

   ```bash
   mapcidr -cidr 192.0.2.0/24 -o /engagement/recon/ips.txt
   ```

2. Check CDN/WAF/cloud presence for live hosts:

   ```bash
   cdncheck -i /engagement/recon/live.example.com.txt \
     -o /engagement/recon/cdn.example.com.txt
   ```

3. Map ASN / organization for in-scope IPs:

   ```bash
   asnmap -i /engagement/recon/ips.txt -o /engagement/recon/asn.txt
   ```

## Output

- `/engagement/recon/ips.txt`
- `/engagement/recon/cdn.<domain>.txt`
- `/engagement/recon/asn.txt`

## Scope

Only map in-scope targets. Cloud/ASN data may reveal out-of-scope ranges — do not expand scope
without operator confirmation.
