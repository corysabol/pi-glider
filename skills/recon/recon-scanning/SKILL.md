---
name: recon-scanning
description: Scan in-scope hosts for open ports and services with naabu, then enrich with httpx/nmap. Use after discovery/scope mapping to map the network attack surface before any active testing.
---

# Port & service scanning

Scan in-scope hosts/ranges for open ports and services.

## Workflow

1. Confirm targets are in scope per `/engagement/RoE.md`.
2. Build a host list (from discovery, or expand in-scope CIDRs):

   ```bash
   naabu -list /engagement/recon/hosts.txt -top-ports 1000 -rate 1000 \
     -o /engagement/recon/ports.txt
   ```

3. Enrich open ports with service/version detection (`httpx` or `nmap`):

   ```bash
   nmap -sV -iL /engagement/recon/ports-hosts.txt -oN /engagement/recon/services.txt
   ```

4. Record open ports per host in `notes/`.

## Output

- `/engagement/recon/ports.txt` (`host:port`)
- `/engagement/recon/services.txt` (optional service detection)

## Scope

Only scan in-scope hosts/ranges. Respect RoE rate/intensity limits — lower `-rate` for fragile
targets.
