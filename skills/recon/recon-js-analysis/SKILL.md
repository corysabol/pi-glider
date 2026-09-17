---
name: recon-js-analysis
description: Crawl and extract JavaScript files and endpoints from in-scope web apps with katana.
---

# JavaScript analysis

Crawl in-scope web apps and extract JavaScript files and endpoints.

## Workflow

1. Crawl with JS extraction:

   ```bash
   katana -list /engagement/recon/live.example.com.txt -js-crawl -jc \
     -o /engagement/recon/js.example.com.txt
   ```

2. Extract endpoints/URLs from JS; look for API keys, secrets, and hidden endpoints.
3. Feed interesting endpoints to the Burp MCP tools for deeper inspection.

## Output

- `/engagement/recon/js.<domain>.txt`

## Scope

- Only crawl in-scope apps. Confirm before testing discovered endpoints.
