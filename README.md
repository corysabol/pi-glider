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
config/        canonical agentDir templates (models.json, mcp.json, settings.json)
skills/        source-of-truth skills (core/, recon/, testing/, tools/, mcp/, workflows/)
extensions/    Pi extensions (pi-glider-banner: animated Game of Life glider header)
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
startup header with an animated Conway's Game of Life **glider** (the old-school hacker symbol the
project is named after). It evolves for a short intro, then settles on a static frame.

`scripts/install.sh` copies it into `~/.config/pi-glider/extensions/`, where Pi auto-loads it. To
disable it, delete `~/.config/pi-glider/extensions/pi-glider-banner/` (or remove it from the repo
before running `install.sh`). Tweak the animation in `extensions/pi-glider-banner/index.ts`
(`TICK_MS`, `MAX_GENERATIONS`, `COLS`/`ROWS`, `ALIVE`/`DEAD` glyphs).
