# Architecture

pi-glider is a containerized Pi-based penetration-testing agent. This document describes the
architecture, the configuration model, and the networking model.

## 1. Components

```
Operator host
├── ~/.config/pi-glider/            # live agentDir (models.json, mcp.json, skills/, settings.json)
├── ~/engagements/<name>/           # per-engagement dir (RoE.md + working files + evidence)
│     ├── RoE.md                    # source of truth: scope, RoE, targets, goals
│     ├── recon/                    # recon output
│     ├── evidence/                 # screenshots, findings, artifacts
│     ├── notes/                    # working notes
│     └── sessions/                 # Pi session history
└── Burp Suite (MCP over SSE) + LAN inference server

Kali Linux container (disposable)
├── /root/.pi/agent   ← bind-mount ~/.config/pi-glider/   (Pi agentDir)
├── /engagement       ← bind-mount ~/engagements/<name>/  (working dir + evidence)
├── Pi coding agent (TUI session the operator attaches to)
├── ProjectDiscovery toolchain (installed via pdtm)
└── pi-mcp-extension → SSE to host Burp MCP
```

## 2. Key properties

- **Disposable container, durable evidence.** Everything inside the container can be thrown away;
  the engagement dir and the agentDir survive on the host.
- **Scoped agent.** The agent aligns against `RoE.md`. Working files (new IPs/hosts discovered
  during recon) accumulate in the engagement dir but never override the RoE as the authority on
  what is *in scope*.
- **Config pulled from host.** The containerized agent's config/skills come from a host directory,
  so operators edit skills and tool preferences without rebuilding the image.

## 3. The agent: Pi (not Bionic)

This project targets the **Pi coding agent** (`pi.dev`, `github.com/earendil-works/pi`), a
terminal-first agent whose config lives at `~/.pi/agent/` and whose model config file is
`models.json`. "Bionic" is LM Studio's own agent (a different product with a different config
layout at `~/.lmstudio/`). Skills are authored to the **Agent Skills standard** so they remain
portable across Pi, Claude Code, and Bionic.

Pi install: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`.

## 4. Configuration directory (agentDir)

Pi resolves its entire config directory via `PI_CODING_AGENT_DIR` (default `~/.pi/agent/`).
pi-glider uses a **dedicated agentDir** on the host and mounts it into the container:

- Host: `~/.config/pi-glider/`
- Container: `/root/.pi/agent` (with `PI_CODING_AGENT_DIR=/root/.pi/agent` set explicitly)

This cleanly separates the pentest agent's config/skills from the operator's normal Pi config.

```
~/.config/pi-glider/
├── models.json        # inference providers/models (LAN server, LM Studio, etc.)
├── settings.json      # Pi settings (skill paths, tool prefs; sandbox disabled)
├── mcp.json           # MCP servers (Burp over SSE, etc.)
├── skills/            # global skills for the pentest agent
├── prompts/           # prompt templates (optional, operator-defined)
├── sessions/          # default session dir (redirected per-engagement via mount)
└── extensions/        # installed extensions (pi-mcp-extension, etc.)
```

The repo is the canonical/versioned source of truth; `scripts/install.sh` seeds
`~/.config/pi-glider/` from `config/` and `skills/`.

## 5. MCP

Pi does not ship MCP built-in; it is supplied by an extension. pi-glider standardizes on
**`pi-mcp-extension`** (`pi install npm:pi-mcp-extension`), which supports `stdio`,
`streamable-http`, and `sse` transports with per-server configurability (timeouts, lifecycle,
health checks).

Config is read from `~/.pi/agent/mcp.json` (global, our mounted agentDir) and `.pi/mcp.json`
(project override, shallow-merged per-server). See `config/mcp.json` for the shape.

`pi-mcp-extension` is baked into the image at build time (global npm) and registered via
`config/settings.json` (`packages`). It is not installed at runtime, so it survives container
teardown.

Burp is the assumed default MCP server (team standard), reached over SSE. Operators can add any
other MCP servers by editing `mcp.json`.

## 6. Networking

Default is the **bridge network**. Host-side services are reached via `host.docker.internal`;
LAN hosts (inference servers) are reachable by LAN IP through the bridge.

| Host | Reaching host services | Reaching LAN inference | Notes |
|------|------------------------|------------------------|-------|
| macOS | `host.docker.internal` | LAN IP via bridge | `--network=host` not supported by Docker Desktop |
| Linux | `host.docker.internal` (or `--network=host`) | LAN IP via bridge (or `--network=host`) | `--network=host` is an optional variant |

Consequences:

- `models.json` `baseUrl` for LM Studio on the host: `http://host.docker.internal:1234/v1`
  (or the LAN IP of the inference desktop).
- `mcp.json` Burp SSE URL: `http://host.docker.internal:<port>/...`.

## 7. Sandboxing

The container is the sandbox. Pi's own sandbox extension is **not** enabled. This means the agent
has full network/process access *inside the container*, which is the intended posture for a
pentest agent — the container boundary (plus the operator's `RoE.md`) is what contains it.
