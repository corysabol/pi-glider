---
name: testing-access-control
description: Test authorization (IDOR, horizontal/vertical privilege escalation, forced browsing) and authentication (bypass, session management) — OWASP A01/A07. Use to check whether someone can access what they shouldn't.
---

# Access control & authentication testing (A01 / A07)

The "who can access what" family. The operator usually supplies two roles/accounts (e.g. `user1`
vs `admin`) to compare against each other.

## Authorization (A01)

1. Enumerate the app first (`testing-web-map`) so you know the endpoints and roles.
2. **IDOR** — as a lower-privileged role, swap a resource identifier (numeric ID, UUID, filename)
   in a request and check whether another user's resource returns. Use `caido_get_request` to grab
   the request and `caido_send_request` to replay it with the swapped identifier.
3. **Vertical privilege escalation** — call an admin-only endpoint or token as a normal user.
4. **Horizontal escalation** — access another equal-privilege user's data.
5. **Forced browsing** — request known admin/reference paths (`/admin`, `/api/internal`, …) directly.
6. Confirm each with evidence (the returned data/status) and record findings.

## Authentication (A07)

- Look for bypass/alternate flows: weak password reset, default credentials, missing rate-limit on
  login (only within RoE), session fixation, missing logout, JWT claim tampering.
- Confirm one thing at a time; do not brute-force beyond RoE limits.

## Output

- Confirmed findings → `/engagement/evidence/<id>-<slug>.md`.

## Scope

Use only the accounts/roles RoE authorizes. Stop at confirmation (a single proving request) — do
not enumerate or exfiltrate other users' data beyond what the operator directed.
