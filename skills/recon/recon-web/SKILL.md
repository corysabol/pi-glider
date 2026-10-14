---
name: recon-web
description: Probe live hosts with httpx, fingerprint TLS/certs with tlsx, and crawl with katana to map the in-scope web attack surface. Use after discovery/port scanning to find live services, technologies, and JS endpoints.
---

# Web probing, fingerprinting & JS discovery

Map the live web attack surface for in-scope hosts.

## Workflow

1. Feed a host list (subdomains/live hosts) to `httpx` for probing + tech detection:

   ```bash
   httpx -l /engagement/recon/hosts.txt -title -tech-detect -status-code -web-server \
     -follow-redirects -o /engagement/recon/live.txt
   ```

2. Fingerprint TLS/certificates on live hosts:

   ```bash
   tlsx -l /engagement/recon/live.txt -san -cn -so -o /engagement/recon/tls.txt
   ```

3. Crawl live hosts and extract JS files/endpoints:

   ```bash
   katana -list /engagement/recon/live.txt -js-crawl -jc -o /engagement/recon/js.txt
   ```

4. Inspect interesting traffic/endpoints in Caido via the `caido_*` tools rather than raw logs.

## Output

- Live hosts: `/engagement/recon/live.txt`
- TLS/cert: `/engagement/recon/tls.txt`
- Crawled/JS endpoints: `/engagement/recon/js.txt`

## Scope

Only probe in-scope hosts. Confirm before any active/intrusive testing of discovered endpoints.
