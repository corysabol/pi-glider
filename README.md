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

The container mounts:

- `~/.config/pi-glider/` → `/root/.pi/agent` (Pi agentDir: config + skills)
- `~/engagements/<name>/` → `/engagement` (working dir + evidence)
- `~/engagements/<name>/sessions/` → `/root/.pi/agent/sessions` (session history)

## Layout

```
config/        canonical agentDir templates (models.json, mcp.json, settings.json)
skills/        source-of-truth skills (core/, recon/, testing/, tools/, mcp/, workflows/)
container/     Dockerfile, docker-compose.yml, entrypoint, pdtm tool list
templates/     engagement templates (RoE.md, .gitignore)
scripts/       install.sh (seed config) + pi-glider.sh (launch wrapper)
docs/          architecture, skill-authoring, engagement-workflow, smoke-test
```

## Skills

Skills follow the [Agent Skills standard](https://agentskills.io/specification) and are
portable across Pi, Claude Code, and Bionic. See [`docs/skill-authoring.md`](docs/skill-authoring.md).

Categories: `core/` (operating manual, authoring, engagement setup), `recon/` (subdomain, DNS,
port, HTTP, fingerprint, JS, cloud, CIDR), `testing/` (nuclei), `tools/` (per-tool reference),
`mcp/` (Burp), and `workflows/` (external recon sweep).
