---
name: recon-fingerprinting
description: Fingerprint live web hosts (technologies, titles, status codes) with httpx and TLS with tlsx.
---

# Web fingerprinting

Identify technologies and TLS details of live web hosts.

## Workflow

1. Feed live hosts to `httpx` with tech detection:

   ```bash
   httpx -l /engagement/recon/live.example.com.txt -title -tech-detect -status-code \
     -web-server -favicon -o /engagement/recon/fingerprint.example.com.txt
   ```

2. TLS/certificate fingerprinting with `tlsx`:

   ```bash
   tlsx -l /engagement/recon/live.example.com.txt -san -cn -so \
     -o /engagement/recon/tls.example.com.txt
   ```

## Output

- `/engagement/recon/fingerprint.<domain>.txt`
- `/engagement/recon/tls.<domain>.txt`

## Scope

- Only fingerprint in-scope hosts.
