---
name: tools-subfinder
description: |-
  Reference for subfinder: passive subdomain enumeration from many sources.
---

# subfinder

Passive subdomain discovery from public sources (APIs, certificates, DNS, etc.).

Key flags:

- `-d <domain>` target domain
- `-dL <file>` list of domains
- `-all` use all sources (slower)
- `-silent` minimal output
- `-o <file>` output file

Configure API keys in `~/.config/subfinder/provider-config.yaml` for more sources.
