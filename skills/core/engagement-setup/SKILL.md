---
name: engagement-setup
description: Initialize a penetration-test engagement directory, parse RoE.md, and set up working-file and evidence conventions.
---

# Engagement setup

Use this skill when starting a new engagement or when asked to set up the engagement directory.

## Steps

1. Confirm the engagement directory exists at `/engagement` and contains `RoE.md`.
2. Read `/engagement/RoE.md` fully. Extract:
   - in-scope targets (domains, IPs, ranges)
   - out-of-scope targets
   - rules of engagement and any restrictions
   - goals/objectives
3. Create the working subdirectories if missing: `recon/`, `evidence/`, `notes/`, `sessions/`.
4. Record a short summary of scope and goals in `notes/scope-summary.md`.

## Conventions

- `RoE.md` is the source of truth; never overwrite it.
- Keep raw tool output in `recon/`, findings/artifacts in `evidence/`, and an audit trail in
  `notes/`.
- Confirm scope before any active testing beyond passive recon.
