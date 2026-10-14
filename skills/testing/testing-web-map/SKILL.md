---
name: testing-web-map
description: Map an in-scope web application — crawl (authenticated and unauthenticated) to enumerate endpoints, parameters, roles, and functionality, and record the attack surface and auth model. Use as the first step before any active web testing.
---

# Web application mapping

Build an inventory of the application's real attack surface before testing. This is distinct from
`recon-web` (external footprint — hosts/ports/TLS); here you map the app's own routes, API
endpoints, parameters, roles, and functionality.

Mapping is **stateful** — browse the app interactively (in Caido or via the browser tools) while
capturing traffic, since role/state-dependent behavior won't show in a passive crawl. For a deep,
dedicated API inventory, see `testing-api-map`.

## Workflow

1. Confirm the app is in scope per `/engagement/RoE.md`; note any credentials/roles provided.
2. Probe the app root and discover the API surface first:

   ```bash
   httpx -u https://target -title -tech-detect -status-code -web-server
   # probe for API specs / introspection
   for p in /swagger /swagger-ui /openapi.json /v3/api-docs /api-docs /graphql; do
     curl -sS -o /dev/null -w "%{http_code} /$p\n" "https://target$p"
   done
   ```

3. Crawl unauthenticated, then extract JS for hidden endpoints:

   ```bash
   katana -u https://target -d 5 -jc -o /engagement/recon/crawl.txt
   katana -u https://target -js-crawl -jc -o /engagement/recon/js.txt
   ```

4. Log in as each given role with the browser tools (`browser_navigate` to the login page, then
   `browser_evaluate` to submit credentials), and re-crawl as that role to find role-gated routes.
5. Pull observed requests from Caido (`caido_list_requests` / `caido_get_request`) to see the real
   methods and parameters; record which parameters each endpoint accepts.
6. Record an application inventory to `/engagement/recon/app-map.md`: routes, API endpoints,
   parameters (`name` → where used), roles/access model, tech stack, and entry points worth testing.

## Output

- `/engagement/recon/app-map.md` — the application inventory.

## Scope

Map in-scope apps only. This is enumeration, not testing — do not attack or fuzz yet; confirm
before any active testing.
