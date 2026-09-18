# System prompt & compaction re-injection

Status: implemented (approach 1 — append + full-body re-injection). See follow-ups below.

## Goal

Keep the agent aligned with the pi-glider methodology even as context grows and is auto-compacted.
Three layers work together:

1. **`config/APPEND_SYSTEM.md`** — a minimal, purpose-aligned system prompt appended to Pi's default
   prompt and injected every turn (so it survives compaction).
2. **`config/methodology-tips.md`** — operator-editable general testing heuristics (seeded once,
   never clobbered unless `--force`).
3. **`extensions/pi-glider-compaction/`** — a small extension that injects the tips at
   `session_start`, and re-injects the full `pi-glider` skill body **and** the tips after every
   `session_compact`, so the methodology is fresh again after the model's earlier read of it is
   summarized away.

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
- prefer using existing tools where possible.
- leverage the various installed skills when relevant.
- Follow the general testing heuristics in `methodology-tips.md` (operator-editable).
```

## Injection

`extensions/pi-glider-compaction/index.ts` has two handlers:

- `session_start` — injects `methodology-tips.md` once, so the tips are in context from the first
  turn.
- `session_compact` — re-injects both `skills/core/pi-glider/SKILL.md` and `methodology-tips.md`.

Both call `pi.sendMessage({ customType, content, display: false }, { deliverAs: "steer" })`. Custom
messages are converted to `user` role in LLM context (`convertToLlm`), so the content is injected
without triggering a spurious turn; `display: false` keeps it out of the transcript. A
`ctx.ui.setStatus(...)` writes a confirmation to the footer status bar (which survives
compaction's transcript rebuild, unlike `notify`).

`scripts/install.sh` seeds `APPEND_SYSTEM.md`, `methodology-tips.md` (and `SYSTEM.md`, if present)
into the agentDir.

## Follow-ups

- **Condensed-core re-injection (alternative).** If the ~2–3k-token full-body re-injection proves
  too heavy or noisy, replace the injected content with a ~10-line condensed core (RoE is source of
  truth, recon → plan → confirm → test → document, breadth over depth, confirm → write → move on)
  and leave the full skill one `read` away. Revisit after testing.
- **`SYSTEM.md` full replacement.** If the "coding assistant" identity ever conflicts with the
  pentest role, switch to `SYSTEM.md` (full replacement) and re-author the tool/guideline
  scaffolding.
