---
name: testing-api-map
description: Enumerate and document an in-scope API's endpoints, methods, schemas, auth scheme, and versions (OpenAPI/Swagger/GraphQL). Use to inventory an API's attack surface before active testing.
---

# API inventory & enumeration

Document an API's real attack surface before testing. This is the deep, API-only version of the
API-surface discovery in `testing-web-map`. Where possible, browse/traverse the API **interactively
while capturing traffic in Caido** — API behavior is stateful (auth, roles, versioning), so a
passive crawl alone misses a lot.

## Workflow

1. Confirm the API is in scope per `/engagement/RoE.md`; note any tokens/roles provided.
2. Discover the spec first:

   ```bash
   for p in /openapi.json /openapi.yaml /swagger /swagger-ui /v3/api-docs /api-docs /graphql; do
     curl -sS -o /dev/null -w "%{http_code} /$p\n" "https://target$p"
   done
   ```

3. If there is no spec, enumerate routes — inspect JS bundles for API calls, and fuzzy-match paths:

   ```bash
   katana -u https://target -js-crawl -jc -o /engagement/recon/api-js.txt
   ffuf -w /usr/share/seclists/Discovery/Web-Content/api/api-endpoints.txt \
     -u https://target/FUZZ -o /engagement/recon/api-ffuf.json
   ```

4. Walk each endpoint interactively with the browser tools (`browser_navigate`/`browser_evaluate`) or
   replay via `caido_send_request`, capturing the auth scheme, methods, parameters, and responses.
   Identify versions (`/v1`, `/v2`, headers, deprecated endpoints).
5. Record the inventory to `/engagement/recon/api-map.md`: base URL, auth scheme (API key, Bearer/JWT,
   OAuth), versions, and each endpoint → methods → parameters → roles.

## Output

- `/engagement/recon/api-map.md` — the API inventory.

## Scope

Map in-scope APIs only. This is enumeration — do not fuzz or attack yet; confirm before active
testing.
