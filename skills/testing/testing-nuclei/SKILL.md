---
name: testing-nuclei
description: Run nuclei vulnerability scans against in-scope targets with appropriate templates and rate limits.
---

# Nuclei scanning

Template-based vulnerability scanning for in-scope targets.

## Workflow

1. Confirm targets are in scope and active testing is authorized per `/engagement/RoE.md`.
2. Run `nuclei` with appropriate templates:

   ```bash
   nuclei -l /engagement/recon/live.example.com.txt -severity low,medium,high,critical \
     -o /engagement/recon/nuclei.example.com.txt
   ```

3. Review findings; validate before reporting.
4. Record confirmed findings in `evidence/`.

## Output

- `/engagement/recon/nuclei.<domain>.txt`

## Scope

- Only scan in-scope targets. Respect RoE (no DoS templates unless authorized). Confirm before
  destructive tests.
