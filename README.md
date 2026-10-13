# pi-glider

A **Pi-based penetration-testing agent**. It runs the [Pi coding agent](https://pi.dev) with a
curated set of skills, extensions, and the ProjectDiscovery toolchain, driven by an operator-authored
engagement brief (`RoE.md` for network/web, or a MASTG kickoff for mobile), with an in-container
Caido instance for web-traffic capture and inspection.

Two run modes:

- **Container (default)** — a Kali Linux container runs Pi alongside the ProjectDiscovery toolchain.
  The container is the sandbox (Pi's own sandbox is disabled) and is disposable; evidence and session
  history persist in the engagement directory.
- **Host (`--no-container`)** — Pi runs directly on the host, for engagements that need host-only
  tooling (e.g. ADB for mobile).

- **Scoped** — the agent aligns every action against the engagement brief in the engagement directory.
- **Per-engagement** — each engagement gets a local `.pi/` agentDir (config + skills + extensions),
  seeded from a global template dir, so config travels with the engagement and is easy to clean up.

See [phase0_implementation_plan.md](phase0_implementation_plan.md) for the full plan and
[`docs/architecture.md`](docs/architecture.md) for the architecture.

## Quick start

```bash
# 1. Seed the global agentDir on the host (config + skills + extensions)
./scripts/pi-glider install        # or: ./scripts/install.sh

# 2. Edit your inference endpoint
$EDITOR ~/.config/pi-glider/models.json

# 3. Initialize the engagement directory (RoE template + working dirs + .pi agentDir)
./scripts/pi-glider init ~/engagements/acme
$EDITOR ~/engagements/acme/RoE.md

# 4. Build the image (container mode only)
docker build -t pi-glider:latest container/

# 5. Launch the agent
./scripts/pi-glider ~/engagements/acme            # container (default)
./scripts/pi-glider --no-container ~/engagements/acme   # host, no container
```

To install the CLI to your PATH (so you can run `pi-glider` from any directory):

```bash
./scripts/pi-glider self-install   # symlinks to ~/.local/bin/pi-glider
```

`~/.local/bin` must be on your `PATH`; override the target dir with `PI_GLIDER_BIN_DIR` (e.g.
`/usr/local/bin`). This is a symlink, so it tracks the repo; a proper package/installer is a
future goal.

On first launch, `pi-glider` seeds a local `.pi/` agentDir into the engagement directory (copied
from the global `~/.config/pi-glider/`), so config, skills, and extensions travel with the
engagement. Edit the engagement `.pi/` during an engagement; copy changes back to the global
dir to reuse them later.

In container mode the CLI publishes the Caido UI (host `5000`) and HTTP proxy (host `8080`) ports
and mounts:

- `~/engagements/<name>/` → `/engagement` (working dir + evidence; the agent's config lives at
  `/engagement/.pi`, i.e. `PI_CODING_AGENT_DIR=/engagement/.pi`)

In `--no-container` mode, Pi runs directly on the host with `PI_CODING_AGENT_DIR` pointed at the
engagement `.pi/` — useful for engagements that need host-only tooling (e.g. ADB for mobile).

## Layout

```
config/        canonical agentDir templates (models.json, mcp.json, settings.json, APPEND_SYSTEM.md, methodology-tips.md, context-inject.json)
skills/        source-of-truth skills (core/ = operating manuals; recon/, testing/, tools/, mcp/, workflows/)
extensions/    Pi extensions (pi-glider-banner: glider header; pi-ctx-injector: inject reference material; pi-caido: Caido GraphQL tools)
container/     Dockerfile, docker-compose.yml, entrypoint, pdtm tool list
templates/     engagement templates (engagement/: RoE, finding, .gitignore; mastg/: MASTG kickoff)
scripts/       pi-glider (CLI: install / container / --no-container) + install.sh + pi-glider.sh
docs/          architecture, skill-authoring, engagement-workflow, smoke-test
```

## Skills

Skills follow the [Agent Skills standard](https://agentskills.io/specification) and are
portable across Pi, Claude Code, and Bionic. See [`docs/skill-authoring.md`](docs/skill-authoring.md).

Categories: `core/` (operating manuals — `pi-glider` for network/web, `mastg-android` for mobile —
plus authoring and engagement setup), `recon/` (subdomain, DNS, port, HTTP, fingerprint, JS, cloud,
CIDR), `testing/` (nuclei), `tools/` (per-tool reference), and `workflows/` (external
recon sweep).

## Engagement types

The operating manual is the main thing that changes between engagement types; everything else
(`APPEND_SYSTEM.md`, the ctx-injector, the tooling) is shared.

- **Network / web** — use the `pi-glider` skill and an `RoE.md` brief
  (`templates/engagement/RoE.md`).
- **Mobile (client-side MASTG)** — use the `mastg-android` skill and the MASTG kickoff
  (`templates/mastg/MASTG-Android-Kickoff.md`). Run on the host (`--no-container`) for ADB/AVD
  access, and point `context-inject.json` at `skills/core/mastg-android/SKILL.md`.

## Operating the agent

Pi is deliberately minimal and expects the operator to drive it. There are two ways to work with
the agent; match your intent.

### Two modes

**Directed instruction** — a specific, bounded step. The agent does exactly that and awaits the
next step:

```
/skill:pi-glider extract evidence/app.apk and decompile it with jadx, then await next steps
```

**Open-ended task** — a goal. The agent runs the full methodology (recon → plan → confirm → test →
document) and stops at the plan gate for your sign-off:

```
/skill:pi-glider scan the in-scope targets, run recon, then present a plan before testing
```

### Loading skills

`/skill:<name>` loads a skill's content into context. Everything after the skill name is treated as
the prompt:

- `/skill:pi-glider` — loads the methodology only; it does **not** start work. The agent waits for
  your actual instruction.
- `/skill:pi-glider <prompt>` — loads the methodology **and** runs `<prompt>` in the same turn.

For a mobile engagement, load `/skill:mastg-android` instead of `/skill:pi-glider`.

Prefer attaching the task to the `/skill:` command rather than loading and then prompting
separately — it removes any ambiguity about whether to act.

### Plan-and-confirm gate

On open-ended tasks the agent does not jump straight to exploitation. It reads `RoE.md`, maps the
attack surface, then writes a prioritized plan to `notes/plan.md` and presents it for your
confirmation (or tweaks) before any active testing. Review it, then say "proceed" (or scope it
down, e.g. "run items 1–3, skip 4").

During testing the agent works breadth-first: it confirms each finding (reproduce once + evidence),
writes it, and moves on — it does not deep-dive or over-exploit. Depth is operator-requested.

Confirmed findings are written to `evidence/` using the finding template
(`templates/engagement/finding.md`) with reproduction steps so you can validate them.

See [`docs/engagement-workflow.md`](docs/engagement-workflow.md) and
`skills/core/pi-glider/SKILL.md` for the full methodology.

## System prompt & guidelines

Two mechanisms keep the agent aligned even as context grows and is compacted:

- **`config/APPEND_SYSTEM.md`** — a general system prompt appended to Pi's default prompt and
  injected **every turn** (so it survives compaction). It holds the universal invariants (identity,
  respect scope, breadth over depth, write findings to files) that apply to every engagement type.
- **`config/context-inject.json` + `extensions/pi-ctx-injector/`** — the *engagement-specific*
  guidelines. The extension reads `context-inject.json` (`onStart` / `onCompact` file lists) and
  injects those files at `session_start` and after every `session_compact`, so the operating manual
  and tips stay fresh. Swap the files to change what the agent operates under:

  ```jsonc
  // network / web (default)
  { "onStart":   ["methodology-tips.md"],
    "onCompact": ["skills/core/pi-glider/SKILL.md", "methodology-tips.md"] }

  // mobile (client-side MASTG)
  { "onStart":   ["methodology-tips.md"],
    "onCompact": ["skills/core/mastg-android/SKILL.md", "methodology-tips.md"] }
  ```

`config/methodology-tips.md` is operator-editable general heuristics (seeded once, never clobbered
unless `--force`). `scripts/install.sh` seeds all of these into the agentDir. See
[`docs/system-prompt.md`](docs/system-prompt.md) for the rationale and the `SYSTEM.md` (full
replacement) alternative.

### Debugging extensions

- Extensions auto-load from `<agentDir>/extensions/*/index.ts` at startup and on `/reload`; the
  startup "Extensions" list confirms what loaded.
- `ctx.ui.setStatus(key, text)` writes to the **footer status bar** — persistent and visible. This
  is the reliable way to surface state.
- `ctx.ui.notify(msg, type)` renders a dim line *inside the transcript*, which compaction's
  transcript rebuild wipes — so it is not reliable around `session_compact`.
- `console.log` / `console.error` in an extension go to the process stdout/stderr, which the TUI
  hides. To see them, run non-interactively (`pi --print "..."` or `--mode text`) or redirect
  stderr to a file (`pi 2>/tmp/pi-ext.log`).

## Caido proxy & UI (in-container)

The container runs a headless [Caido](https://caido.io) instance as a web-proxy sidecar. Every
proxy-aware client — in-container Chromium (via Playwright), `curl`, `wget`, Python `requests`, and
the ProjectDiscovery tools — is routed through it via `http_proxy`/`https_proxy`/`ALL_PROXY`
(exported in `container/entrypoint.sh`), so all captured web traffic lands in one place.

**LLM inference traffic bypasses Caido.** The model endpoint(s) from `models.json` are
automatically added to `NO_PROXY` at startup, so inference responses stream directly (MITM'ing
streaming responses through Caido truncates them). Override/extend with `CAIDO_NO_PROXY` if needed.

- **Proxy** — `http://127.0.0.1:8080` inside the container (published to host `8080`).
- **UI/API** — `http://host.docker.internal:5000` (published to host `5000`); open
  http://localhost:5000 in your host browser to inspect captured requests.

The `pi-caido` extension surfaces the captured traffic to the agent as callable tools
(`caido_list_requests`, `caido_get_request`, `caido_get_response`, `caido_list_sitemap`,
`caido_view_sitemap_entry`) that wrap Caido's GraphQL API (guest auth, no seeded credentials).
This lets the model *read* what it has proxied — see `skills/tools/tools-caido` for usage.

A static EC (P-256) MITM CA is generated on first run and persisted under `<engagement>/.caido/certs/`
so it survives image rebuilds; it is installed into the system trust store at runtime and imported
into Caido, so HTTPS interception is trusted by the in-container tools without `-k`.

### Project persistence

The Caido data directory lives at `<engagement>/.caido/`, so captured traffic survives container
teardowns and image rebuilds. However, **Caido does not save projects in guest mode** — the
container auto-bootstraps a *temporary* guest project (via `container/caido-init.js`) so the proxy
has somewhere to record, but temporary projects are not resumed on relaunch.

To persist and resume a project across sessions, connect your Caido client (the web UI at
http://localhost:5000, or Caido Desktop pointed at that host/port) and **log in with a Caido
account** (free saves 2 projects; Pro lifts the limits) instead of "Continue as guest". Create or
select your saved project in the UI — that is the one that persists. Credentials are entered
interactively, so nothing is seeded into the image.

See [`docs/smoke-test.md`](docs/smoke-test.md) Part D for validation steps.

## Startup banner

`extensions/pi-glider-banner/` is a small Pi extension that replaces the built-in `pi vX.Y.Z`
startup header with a Conway's Game of Life **glider** (the old-school hacker symbol the project is
named after) rendered in Unicode full blocks (alive) and light-shade blocks (dead), beside a
block-letter `PI-GLIDER` wordmark and the version:

```
░░░░████░░░░  █████ █████       █████ █     █████ ████  █████ ████
░░░░████░░░░  █   █   █         █     █       █   █   █ █     █   █
░░░░░░░░████  █████   █    ███  █ ███ █       █   █   █ ████  ████
░░░░░░░░████  █       █         █   █ █       █   █   █ █     █ █
████████████  █     █████       █████ █████ █████ ████  █████ █  █
████████████  v0.74.2
```

`scripts/install.sh` copies it into `~/.config/pi-glider/extensions/`, where Pi auto-loads it. To
disable it, delete `~/.config/pi-glider/extensions/pi-glider-banner/` (or remove it from the repo
before running `install.sh`).

The glider animates in place for a short time at startup: it cycles through its four Game-of-Life
phases (a subtle morph) and then freezes on the canonical glider. Startup output (skills/model/
prompt) is held until the animation finishes, so the per-frame re-renders don't hijack the terminal
scroll. Set `ANIMATE = false` in `extensions/pi-glider-banner/index.ts` to render it fully static.
Other knobs there:
`ANIMATE_FRAMES` (phase steps before freezing, default 8), `TICK_MS` (default 150),
`CELL_W`/`CELL_H` (cell size in characters, default 4×2 — kept 2:1 so cells render square, since
terminal cells are ~twice as tall as wide), and the `ALIVE`/`DEAD` glyphs.
