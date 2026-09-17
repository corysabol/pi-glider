---
name: recon-port-scanning
description: Scan in-scope hosts for open ports and services with naabu, with rate limiting and structured output.
---

# Port scanning

Port scanning for in-scope hosts/ranges.

## Workflow

1. Confirm targets are in scope per `/engagement/RoE.md`.
2. Run `naabu` against hosts or a CIDR/file:

   ```bash
   naabu -list /engagement/recon/hosts.txt -top-ports 1000 -rate 1000 \
     -o /engagement/recon/ports.txt
   ```

3. Enrich with service detection (`httpx` or `nmap`) if needed.
4. Record open ports per host in `notes/`.

## Output

- `/engagement/recon/ports.txt` (`host:port`)

## Scope

- Only scan in-scope hosts/ranges. Respect RoE rate/intensity limits.
