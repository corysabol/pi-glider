---
name: testing-misconfig
description: Test security misconfiguration (default creds, exposed files/panels, verbose errors, missing security headers) and cryptographic failures (weak TLS, plaintext secrets) — OWASP A02/A05. Use for configuration and crypto hygiene checks.
---

# Misconfiguration & cryptographic failures (A02 / A05)

Cheap, high-signal checks that don't require crafted payloads.

## Misconfiguration (A05)

1. Exposed files/endpoints: `.git/`, backup files (`*.bak *.old *.orig`), `/actuator`, `/admin`,
   debug/status endpoints, directory listings.
2. Default or blank credentials on in-scope services/panels.
3. Verbose errors leaking stack traces, paths, or SQL.
4. Missing/weak security headers: `Strict-Transport-Security`, `Content-Security-Policy`,
   `X-Frame-Options`, `X-Content-Type-Options`.

   ```bash
   nuclei -u https://target -t http/misconfiguration -t http/exposures \
     -o /engagement/recon/misconfig.txt
   ```

## Cryptographic failures (A02)

- TLS: run `tlsx` for version/cipher/cert issues; flag anything below TLS 1.2.
- Sensitive data in the clear: credentials/tokens over HTTP, secrets in JS bundles or responses.
- Hardcoded keys/secrets if source/repo access is in scope.

## Output

- Raw output → `/engagement/recon/`; confirmed findings → `/engagement/evidence/<id>-<slug>.md`.

## Scope

Only check in-scope targets. Outdated-component detection is `testing-nuclei` (A06); logging and
monitoring gaps (A09) are an operator/process judgment rather than a technical test.
