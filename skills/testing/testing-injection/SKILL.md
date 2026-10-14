---
name: testing-injection
description: Test for injection flaws — SQLi, XSS, command injection, SSTI, XXE, path traversal — and SSRF. Use when fuzzing a specific parameter/input for injection or checking a page for XSS (OWASP A03).
---

# Injection testing (SQLi · XSS · command · SSTI · XXE · path traversal · SSRF)

Driven by a specific input or parameter; the operator usually names it (e.g. "fuzz the `sort`
parameter for SQLi"). Confirm each flaw once with evidence, then move on.

## General

- Pull the target request from Caido (`caido_get_request`) to see the exact method/params to fuzz.
- Test one parameter at a time; use minimal payloads and stop at confirmation (evidence), not
  full exploitation.

## SQLi

1. Confirm the parameter reacts — append `'` and watch for a SQL error or timing change.
2. Once you have a suspected injection point, fuzz it with sqlmap:

   ```bash
   sqlmap -u "https://target/foo?sort=1" -p sort --batch --level 2 --risk 2 \
     --proxy http://127.0.0.1:8080 -o
   ```

3. Confirm with a benign payload (e.g. `' OR '1'='1`) and record evidence. Do not extract data
   beyond a single proving row unless the operator directed it.

## XSS

1. Confirm reflection and context (into HTML body, an attribute, or inline JS); inject a benign
   canary first.
2. Load the payload URL with `browser_navigate`, then confirm execution with `browser_evaluate`
   (e.g. check for an injected marker element or `document.cookie`).
3. Record the working payload + context and a `browser_screenshot` as evidence.

## Command injection / SSTI / XXE / path traversal

Follow the same confirm-first loop with minimal payloads. Use `interactsh-client` for out-of-band
confirmation of blind issues (RCE, SSRF, XXE exfil):

```bash
interactsh-client -o /engagement/recon/interactsh.txt
```

## SSRF (A10)

Feed a URL into the suspected parameter and watch for a callback on your `interactsh` host. Only
probe metadata endpoints (`http://169.254.169.254/…`) if RoE allows it.

## Output

- Confirmed findings → `/engagement/evidence/<id>-<slug>.md` (use the finding format).

## Scope

Only test in-scope inputs. Confirm a finding once, capture evidence, stop — no chaining or data
exfiltration beyond what the operator directed.
