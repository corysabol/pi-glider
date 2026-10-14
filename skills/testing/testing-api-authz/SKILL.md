---
name: testing-api-authz
description: Test API authorization — BOLA (object-level), BFLA (function-level), and BOPLA (mass assignment, excessive data exposure) — OWASP API1/API5/API3. Use to check whether a user can access objects, functions, or properties they shouldn't.
---

# API authorization testing (BOLA · BFLA · BOPLA)

The dominant API risk family. The operator usually supplies two roles/tokens (e.g. `user1` vs
`admin`, or two tenants) to compare against each other.

## Workflow

1. Enumerate the API first (`testing-api-map`) and collect one token per role.
2. **BOLA (object-level, API1)** — as a lower-privileged role, swap object identifiers (numeric IDs,
   UUIDs, tenant IDs) in a resource request and check whether another object returns. Grab the
   request with `caido_get_request`, replay with the swapped ID via `caido_send_request`.
3. **BFLA (function-level, API5)** — call an admin/privileged function with a normal user's token;
   compare response codes across roles.
4. **BOPLA (property-level, API3)** — two directions:
   - *Mass assignment*: send extra properties/fields beyond those the API expects (e.g. `role: "admin"`,
     `isAdmin: true`) and see if they are honored.
   - *Excessive data exposure*: check whether responses return fields the client doesn't need
     (PII, internal IDs, secrets).
5. Confirm each with evidence (the returned data/status) and record findings.

## Output

- Confirmed findings → `/engagement/evidence/<id>-<slug>.md`.

## Scope

Use only the tokens/roles RoE authorizes. Stop at confirmation (a single proving request) — do not
enumerate or exfiltrate other tenants' data beyond what the operator directed.
