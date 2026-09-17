---
name: recon-cloud-infrastructure
description: Map cloud/CDN/ASN infrastructure for in-scope targets with cdncheck and asnmap.
---

# Cloud & ASN infrastructure

Map CDN/WAF/cloud providers and ASN/organization for in-scope targets.

## Workflow

1. Check CDN/WAF presence:

   ```bash
   cdncheck -i /engagement/recon/live.example.com.txt \
     -o /engagement/recon/cdn.example.com.txt
   ```

2. Map ASN/organization for in-scope IPs:

   ```bash
   asnmap -i /engagement/recon/ips.txt -o /engagement/recon/asn.txt
   ```

## Output

- `/engagement/recon/cdn.<domain>.txt`
- `/engagement/recon/asn.txt`

## Scope

- Only map in-scope targets. Cloud/ASN data may reveal out-of-scope ranges — do not expand
  scope without operator confirmation.
