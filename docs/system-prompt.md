# System prompt & compaction re-injection

Status: implemented (approach 1 — append + full-body re-injection). See follow-ups below.

## Goal

Keep the agent aligned with the pi-glider methodology even as context grows and is auto-compacted.
Two mechanisms work together:

1. **`config/APPEND_SYSTEM.md`** — a minimal, purpose-aligned system prompt appended to Pi's default
   prompt and injected every turn (so it survives compaction).
2. **`extensions/pi-glider-compaction/`** — a small extension that re-injects the full `pi-glider`
   skill body after every `session_compact`, so the methodology is fresh again after the model's
   earlier read of it is summarized away.

## Mechanism (from Pi source)

Pi discovers two optional files in the agentDir (`~/.config/pi-glider` → `/root/.pi/agent`):

- `SYSTEM.md` — `customPrompt`: **replaces** the entire default prompt (drops the tools list,
  guidelines, and docs paths).
- `APPEND_SYSTEM.md` — `appendSystemPrompt`: **appended** after the default prompt.

(There is also `AGENTS.md`/`CLAUDE.md`, injected as `<project_context>`.)

We use **append** (`APPEND_SYSTEM.md`) to keep Pi's tools/guidelines/docs scaffolding.

## APPEND_SYSTEM.md content

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

## Compaction re-injection

`extensions/pi-glider-compaction/index.ts` listens to `session_compact` and calls
`pi.sendMessage({ customType: "pi-glider-reinject", content, display: false }, { deliverAs: "steer" })`
with the full `skills/core/pi-glider/SKILL.md` body. Custom messages are converted to `user` role in
LLM context (`convertToLlm`), so the content is injected without triggering a spurious turn; the
`display: false` keeps it out of the transcript (a `ctx.ui.notify` signals it happened).

`scripts/install.sh` seeds `APPEND_SYSTEM.md` (and `SYSTEM.md`, if present) into the agentDir.

## Follow-ups

- **Condensed-core re-injection (alternative).** If the ~2–3k-token full-body re-injection proves
  too heavy or noisy, replace the injected content with a ~10-line condensed core (RoE is source of
  truth, recon → plan → confirm → test → document, breadth over depth, confirm → write → move on)
  and leave the full skill one `read` away. Revisit after testing.
- **`SYSTEM.md` full replacement.** If the "coding assistant" identity ever conflicts with the
  pentest role, switch to `SYSTEM.md` (full replacement) and re-author the tool/guideline
  scaffolding.
