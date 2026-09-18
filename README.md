# pi-glider

A containerized, **Pi-based penetration-testing agent**. A Kali Linux container runs the
[Pi coding agent](https://pi.dev) alongside the ProjectDiscovery toolchain, driven by an
operator-authored `RoE.md` (rules of engagement) and wired to Burp Suite over MCP/SSE.

- **Sandboxed**: the container is the sandbox; Pi's own sandbox is disabled.
- **Disposable**: the container can be thrown away; evidence and session history persist on the host.
- **Scoped**: the agent aligns every action against `RoE.md` in the engagement directory.
- **Configurable**: config, skills, and tool preferences live on the host and are bind-mounted in.

See [phase0_implementation_plan.md](phase0_implementation_plan.md) for the full plan and
[`docs/architecture.md`](docs/architecture.md) for the architecture.

## Quick start

```bash
# 1. Seed the live agentDir on the host (config + skills)
./scripts/install.sh

# 2. Edit your inference endpoint and MCP servers
$EDITOR ~/.config/pi-glider/models.json
$EDITOR ~/.config/pi-glider/mcp.json

# 3. Create an engagement directory and write your RoE
mkdir -p ~/engagements/acme && cp templates/engagement/RoE.md ~/engagements/acme/RoE.md
$EDITOR ~/engagements/acme/RoE.md

# 4. Build the image
docker build -t pi-glider:latest container/

# 5. Launch the agent (or use the wrapper)
./scripts/pi-glider.sh ~/engagements/acme
```

The wrapper auto-starts the Burp MCP bridge (see below) if it isn't already running.

The container mounts:

- `~/.config/pi-glider/` → `/root/.pi/agent` (Pi agentDir: config + skills)
- `~/engagements/<name>/` → `/engagement` (working dir + evidence)
- `~/engagements/<name>/sessions/` → `/root/.pi/agent/sessions` (session history)

## Layout

```
config/        canonical agentDir templates (models.json, mcp.json, settings.json, APPEND_SYSTEM.md)
skills/        source-of-truth skills (core/, recon/, testing/, tools/, mcp/, workflows/)
extensions/    Pi extensions (pi-glider-banner: glider header; pi-glider-compaction: re-inject manual after compaction)
container/     Dockerfile, docker-compose.yml, entrypoint, pdtm tool list
templates/     engagement templates (RoE.md, .gitignore)
scripts/       install.sh (seed config) + pi-glider.sh (launch wrapper) + burp-mcp-bridge.py (Host-rewriting proxy)
docs/          architecture, skill-authoring, engagement-workflow, smoke-test
```

## Skills

Skills follow the [Agent Skills standard](https://agentskills.io/specification) and are
portable across Pi, Claude Code, and Bionic. See [`docs/skill-authoring.md`](docs/skill-authoring.md).

Categories: `core/` (operating manual, authoring, engagement setup), `recon/` (subdomain, DNS,
port, HTTP, fingerprint, JS, cloud, CIDR), `testing/` (nuclei), `tools/` (per-tool reference),
`mcp/` (Burp), and `workflows/` (external recon sweep).

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

## System prompt, tips & compaction

Three layers keep the agent aligned with the pi-glider methodology even as context grows and is
compacted:

- **`config/APPEND_SYSTEM.md`** — a minimal, purpose-aligned system prompt appended to Pi's default
  prompt and injected every turn (so it survives compaction). It restates the core invariants (RoE
  is source of truth, methodology, breadth over depth) and points at the `pi-glider` skill and the
  tips file.
- **`config/methodology-tips.md`** — operator-editable general testing heuristics (e.g. map the
  real API surface, not just client routes). Seeded once by `install.sh` (never clobbered unless
  `--force`), so the operator owns it.
- **`extensions/pi-glider-compaction/`** — a small extension that injects the tips at
  `session_start`, and on every `session_compact` re-injects both the full `pi-glider` skill body
  and the tips as hidden messages so the methodology stays fresh. It also writes a confirmation to
  the **footer status bar** (`pi-glider: re-injected operating manual + tips after compaction`) so
  the operator can see it ran.

`scripts/install.sh` seeds all three into the agentDir. See [`docs/system-prompt.md`](docs/system-prompt.md)
for the rationale and the `SYSTEM.md` (full replacement) alternative.

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

## Burp MCP bridge

Burp Suite's MCP server rejects any request whose `Host`/`Origin`/`Referer` header isn't
`localhost` or `127.0.0.1` (hardcoded DNS-rebinding protection). The container reaches the host via
`host.docker.internal`, which Burp rejects with `403` — and changing Burp's listen address to
`0.0.0.0` does **not** bypass it, because the guard checks the `Host` header value, not the bind
interface.

`scripts/burp-mcp-bridge.py` is a small host-side reverse proxy that listens on `0.0.0.0:9877` and
forwards to Burp on `127.0.0.1:9876`, rewriting the `Host` header to `127.0.0.1:9876` on **every**
request (so HTTP keep-alive works). `config/mcp.json` points Burp at the bridge
(`http://host.docker.internal:9877`).

The launch wrapper (`scripts/pi-glider.sh`) starts the bridge automatically if it isn't already
running and tears it down when the session ends. To run it manually:

```bash
python3 scripts/burp-mcp-bridge.py
```

Environment: `BRIDGE_LISTEN_HOST`/`BRIDGE_LISTEN_PORT` (default `0.0.0.0`/`9877`) and
`BRIDGE_TARGET_HOST`/`BRIDGE_TARGET_PORT` (default `127.0.0.1`/`9876`). On Linux you can instead
use `--network=host` and point `mcp.json` directly at `http://127.0.0.1:9876` (no bridge needed).

See [`docs/smoke-test.md`](docs/smoke-test.md) Part E for validation steps.

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
