---
name: recon-http-probe
description: Probe live hosts with httpx and crawl with katana to map the in-scope web attack surface.
---

# HTTP probing and crawling

Map the live web attack surface for in-scope hosts.

## Workflow

1. Feed a host/subdomain list (e.g. from subdomain enumeration) to `httpx`:

   ```bash
   httpx -l /engagement/recon/subdomains.example.com.txt \
     -title -tech-detect -status-code -web-server -follow-redirects \
     -o /engagement/recon/live.example.com.txt
   ```

2. Review the live list; note technologies and status codes.
3. Crawl live hosts with `katana`:

   ```bash
   katana -list /engagement/recon/live.example.com.txt -o /engagement/recon/crawl.example.com.txt
   ```

4. Use the Burp MCP tools for deeper inspection of specific endpoints when needed.

## Output

- Live hosts: `/engagement/recon/live.<domain>.txt`
- Crawled endpoints: `/engagement/recon/crawl.<domain>.txt`

## Scope

- Only probe in-scope hosts. Confirm before any active/intrusive testing.
