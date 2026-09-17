---
name: recon-cidr-scoping
description: Expand and validate CIDR ranges for scope with mapcidr.
---

# CIDR scoping

Expand in-scope CIDR ranges to IP lists.

## Workflow

1. Expand CIDR ranges to IPs:

   ```bash
   mapcidr -cidr 192.0.2.0/24 -o /engagement/recon/ips.txt
   ```

2. Filter to in-scope ranges only (per `/engagement/RoE.md`).
3. Feed the IP list to port scanning / fingerprinting.

## Output

- `/engagement/recon/ips.txt`

## Scope

- Only expand in-scope ranges. Never expand beyond RoE scope.
