---
name: tools-proxify
description: |-
  Reference for proxify: route tool traffic through a proxy (e.g. Caido).
---

# proxify

HTTP proxy for routing tool traffic.

Key flags:

- `-http-proxy <url>` upstream proxy (e.g. Caido)
- `-addr <host:port>` listen address

Point tools at proxify via `-proxy http://127.0.0.1:8888`.
