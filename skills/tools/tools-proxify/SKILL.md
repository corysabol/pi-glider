---
name: tools-proxify
description: Reference for proxify: route tool traffic through a proxy (e.g. Burp).
---

# proxify

HTTP proxy for routing tool traffic.

Key flags:

- `-http-proxy <url>` upstream proxy (e.g. Burp)
- `-addr <host:port>` listen address

Point tools at proxify via `-proxy http://127.0.0.1:8888`.
