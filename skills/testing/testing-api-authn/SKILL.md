---
name: testing-api-authn
description: Test API authentication (OWASP API2) — JWT/token weaknesses, missing or bypassable auth, token leakage, and credential/OAuth flows. Use to check how the API verifies identity.
---

# API authentication testing (API2)

How the API verifies *who* is calling. Identify the scheme first (`testing-api-map`), then probe it.

## Workflow

1. **Missing auth** — call each endpoint without a token and check for unauthenticated access.
2. **JWT/token weaknesses** — decode and inspect any JWT:

   ```bash
   # decode header + payload; check alg, expires, claims
   jwt=$(cat token); echo "$jwt" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
   ```

   Look for `alg: none`, RS256→HS256 key-confusion, weak signing secrets (try `jwt_tool` /
   `hashcat` only if RoE allows), missing `exp`/`aud`, or over-broad claims.
3. **Token leakage** — search responses, error messages, JS bundles, and logs for exposed tokens or
   API keys (observed via `caido_list_requests`).
4. **Credential/OAuth flows** — look for weak password-reset, missing lockout, or OAuth redirect
   issues; only within RoE limits (no broad brute force).
5. Confirm each with evidence and record findings.

## Output

- Confirmed findings → `/engagement/evidence/<id>-<slug>.md`.

## Scope

Use only the credentials/tokens RoE authorizes. Confirm once with evidence, stop — no credential
stuffing or token extraction beyond what the operator directed.
