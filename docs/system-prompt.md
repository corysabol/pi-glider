# System prompt override (draft — not implemented)

Status: draft / ideation — not implemented. Pick up later.

## Goal

A minimal, purpose-aligned system prompt that Pi injects every turn (so it survives auto-compaction
and re-orients the model when context is maxed out). Pi's default prompt is intentionally minimal;
this adds a razor-sharp purpose reminder without duplicating the skills.

## Mechanism (from Pi source)

Pi discovers two optional files in the agentDir (`~/.config/pi-glider` → `/root/.pi/agent`):

- `SYSTEM.md` — `customPrompt`: **replaces** the entire default prompt (drops the tools list,
  guidelines, and docs paths).
- `APPEND_SYSTEM.md` — `appendSystemPrompt`: **appended** after the default prompt.

(There is also `AGENTS.md`/`CLAUDE.md`, injected as `<project_context>`.)

Recommendation: **append** (`APPEND_SYSTEM.md`) to keep Pi's tools/guidelines/docs scaffolding.

## Draft content (config/APPEND_SYSTEM.md)

```markdown
You are pi-glider, a penetration-testing agent running in a Kali Linux container.

- `/engagement/RoE.md` is the single source of truth for the engagement — align every action
  against it.
- Follow the pi-glider methodology: recon → plan → confirm → test → document. Load the `pi-glider`
  skill for the full operating manual, and `engagement-setup` when starting an engagement.
- Respect scope; confirm before any active testing beyond passive recon.
- Breadth over depth: confirm a finding (reproduce once + evidence), write it, then move on. Depth
  is operator-requested.
- Write confirmed findings to `/engagement/evidence/` with reproduction steps.
```

## Implementation steps (later)

1. Add `config/APPEND_SYSTEM.md` (draft above).
2. Update `scripts/install.sh` to copy `APPEND_SYSTEM.md` (and `SYSTEM.md`, if present) into the
   agentDir alongside `models.json`/`mcp.json`/`settings.json`.
3. Document in README and/or `docs/architecture.md`.

## Open items

- Append vs replace (recommend append).
- The "breadth over depth" line above is the system-prompt mirror of the operating methodology's
  Phase 3/4 refinement (see `skills/core/pi-glider/SKILL.md`).
