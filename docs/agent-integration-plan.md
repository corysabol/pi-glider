# Agent integration plan — Caido, Playwright, and skills usage

**Status:** in progress. This document is the plan; the work is committed in small, revertable
increments as it lands.

## Problem statement

The agent is *surrounded* by capabilities it doesn't reliably use:

- **Caido** runs as the in-container proxy so all web traffic is captured, but the model can only
  *proxy through* it. It cannot query, read, replay, or annotate the captured traffic — that is a
  manual, operator-only activity.
- **Playwright** is installed and its Chromium is proxy-routed, but there is no callable tool. The
  model must hand-write `node require('playwright')` scripts, so in practice it never reaches for
  the browser.
- **Skills** (≈24 of them) are authored but the model almost never loads one on its own — the only
  reliable path today is an explicit `/skill:<name> "prompt"` from the operator. The model defaults
  to raw `bash` commands.

The through-line is the same in all three cases: **the capability is "reachable but not surfaced."**
Infrastructure and prose exist; what is missing is (a) a callable tool the model routes to, and (b)
an action-oriented index that tells the model *which* skill/tool maps to *which* intent.

## Goals and non-goals

**Goals**

1. Surface Caido programmatically to the model (read captured traffic, replay, annotate), through a
   first-party Pi extension.
2. Surface Playwright to the model as a callable browser tool, not a hand-written-script chore.
3. Make the model load the right skill on its own, without needing `/skill:` every time.

**Non-goals (deferred, already tracked in `docs/todo.md`)**

- Version pinning (Node/Pi/Playwright stay "latest"; pinning via build ARGs is a later phase).
- Seeding Caido credentials into the image (operator logs in interactively; PAT support later).
- Burp MCP (dropped — bloat; native Pi MCP + Caido is the forward path).

## Key facts (verified)

- **Skill discovery is not broken.** Pi recursively scans `.pi/skills/` (the agentDir is
  `PI_CODING_AGENT_DIR=/engagement/.pi`) and injects each skill's `name` + `description` into the
  system prompt as `<available_skills>` XML. `settings.json → "skills": []` is an *extra* path list,
  not the discovery switch — leaving it empty is correct. Pi itself notes "models don't always
  [load skills]; use prompting or `/skill:name` to force it." The failure is **routing quality**,
  not discovery.
- **Extension tool API** (from `@earendil-works/pi-coding-agent`): `pi.registerTool()` /
  `defineTool({ name, label, description, parameters: Type.Object({...}), async execute(toolCallId,
  params, signal, onUpdate, ctx) → { content: [{ type: "text", text }], details } })`. `Type` is
  imported from `@earendil-works/pi-ai`. Extensions auto-load from `<agentDir>/extensions/*/index.ts`
  and hot-reload on `/reload`.
- **Caido's programmatic interface is GraphQL** (`/graphql` on the UI port) with an official
  `@caido/sdk-js`; the instance boots with `--allow-guests` so tooling can auth via
  `loginAsGuest → accessToken` (same pattern Strix and our `caido-init.js` use). Guest mode does
  **not** persist projects; that stays an operator-account concern.

## Thread 1 — Skills usage (do first; fastest, no image rebuild)

The skills descriptions are already in the system prompt; the fix is to make the routing *directive*
rather than rely on a local model weighting 24 bare descriptions. In order:

1. **Add a skills index** — a single `config/skills-index.md` mapping intent → skill
   ("enumerate subdomains → `recon-subdomain-enumeration`", "dynamic browser testing →
   `tools-playwright`", etc.), injected via `context-inject.json` `onStart` (alongside
   `methodology-tips.md`) so it is always in context from message one.
2. **Add an explicit routing dispatch table** to `skills/core/pi-glider/SKILL.md` (`## Skill
   routing`) so the operating manual (re-injected on compact) tells the model which skill to load
   per intent.
3. **Sharpen `description` front matter** across `recon/`/`testing/`/`tools/`/`workflows/` —
   every description states *purpose* + *when to use it* (not implementation), ≤ ~150 chars. This is
   what the model actually sees in the system prompt.
4. **Strengthen `APPEND_SYSTEM.md`** — replace the weak "leverage the various installed skills"
   with a concrete directive ("check the skills index first; prefer `/skill:<name>` over raw
   commands for anything with a matching skill").
5. **Optional (later):** consolidate the ~15 one-per-tool `tools-*` skills into fewer, richer
   references; add a `tool_call`/`user_bash` hook that re-injects the methodology on command
   execution (already sketched in `todo.md`).

## Thread 2 — Caido integration (Option C: first-party extension)

A new `extensions/pi-caido/` wrapping Caido's GraphQL API directly, with a curated, token-efficient
tool set modeled on Strix's baked `caido_api` and `pi-caido`'s tool names. Avoid the community
`caido-mcp-server` bridge (extra hop; ~64 low-level tools is token-heavy). Auth via guest token, no
creds seeded.

Tool surface (phased):

- **P0 (read-only)** — `caido_list_requests`, `caido_get_request`, `caido_get_response`,
  `caido_list_sitemap`, `caido_view_sitemap_entry`.
- **P1 (replay/send)** — `caido_send_request` (repeat), `caido_send_raw_request`.
- **P2 (findings)** — `caido_create_finding`, `caido_list_findings`.
- **P3 (scope)** — `caido_list_scopes`, `caido_add_scope`.
- **P4 (automation)** — richer querying/export.

Each tool returns trimmed, model-facing text (with a pointer to full data under `/engagement/`),
and declares `readOnlyHint`/`destructiveHint` annotations so a future permission layer can gate
destructive ops.

The GraphQL queries are pinned to the installed Caido version's schema; verify field names via
`__type` introspection at runtime (the `tools-caido` skill already documents the `requests`
connection shape).

## Thread 3 — Playwright surfacing (follows Caido)

A small `extensions/pi-playwright/` exposing a `browser` tool (launch routed through
`$CAIDO_CHROMIUM_ARGS`, navigate, snapshot DOM/screenshot, collect requests), so the model can do
dynamic testing without hand-writing Node. Reuses the `tools-playwright` skill for guidance; the
tool becomes the callable entry point the skill points at.

## Implementation order & commit strategy

Commit each step separately so any one can be reverted:

1. This plan doc.
2. Skills fixes (index + routing table + sharpened descriptions + `APPEND_SYSTEM.md`).
3. `extensions/pi-caido/` — P0 read-only tools + registration in `install.sh`/context.
4. `extensions/pi-playwright/` — `browser` tool.
5. Docs/README/smoke-test updates for the new extensions and routing.

## Smoke test

- **Skills:** JSON/YAML validity (`bash`/`python` checks in `docs/smoke-test.md` A3/A4); launch the
  existing image and confirm the skills index is injected and `/skill:<name>` resolves; confirm
  `settings.json → skills` stays harmless.
- **Caido/Playwright:** `bash -n` + TypeScript type-check via the running image (extensions load via
  `jiti`, so `pi` will report load errors at startup); in a live container, confirm the Caido tools
  return captured `curl` traffic, and the Playwright tool drives Chromium through the proxy and the
  request lands in Caido.
- Because extensions/skills/config are seeded at runtime from the repo (via `install.sh`), most of
  this is validatable **without rebuilding the image**.

## Open questions / risks

- Exact `requests`/`sitemap` GraphQL field names by Caido version — verify via introspection before
  finalizing P0 queries.
- Whether `@caido/sdk-js` vs raw `fetch`/GraphQL is worth the dependency for P0 (lean toward raw
  `fetch` to avoid a build-time dependency).
- Extension tools register but the model still has to *call* them — pair each with a sharp
  `description` + the skills index entry (same routing lesson as Thread 1).
