# Architecture

pi-glider is a Pi-based penetration-testing agent. It runs either in a disposable Kali Linux
container (default) or directly on the host (`--no-container`). This document describes the
architecture, the configuration model, and the networking model.

## 1. Components

```
Operator host
├── ~/.config/pi-glider/            # global template dir (seeded by scripts/install.sh)
│     ├── models.json / mcp.json / settings.json
│     ├── APPEND_SYSTEM.md / methodology-tips.md / context-inject.json
│     └── skills/  extensions/  prompts/
├── ~/engagements/<name>/           # per-engagement dir
│     ├── RoE.md                    # source of truth: scope, RoE, targets, goals
│     ├── recon/                    # recon output
│     ├── evidence/                 # screenshots, findings, artifacts
│     ├── notes/                    # working notes
│     └── .pi/                      # per-engagement agentDir (seeded once from the global dir)
│           ├── models.json / mcp.json / settings.json
│           ├── APPEND_SYSTEM.md / methodology-tips.md / context-inject.json
│           ├── skills/  extensions/
│           └── sessions/           # Pi session history
└── Burp Suite (MCP over SSE) + LAN inference server

Kali Linux container (disposable; container mode only)
├── /root/.pi/agent   ← bind-mount <engagement>/.pi/   (Pi agentDir)
├── /engagement       ← bind-mount <engagement>/        (working dir + evidence)
├── Pi coding agent (TUI session the operator attaches to)
├── ProjectDiscovery toolchain (installed via pdtm)
└── pi-mcp-extension → SSE to host Burp MCP (via bridge)
```

## 2. Key properties

- **Disposable container, durable evidence.** Everything inside the container can be thrown away;
  the engagement dir (including its `.pi/` agentDir and session history) survives on the host.
- **Scoped agent.** The agent aligns against `RoE.md`. Working files (new IPs/hosts discovered
  during recon) accumulate in the engagement dir but never override the RoE as the authority on
  what is *in scope*.
- **Per-engagement config.** Each engagement gets its own `.pi/` agentDir, seeded once from a global
  template dir. Config, skills, and extensions travel with the engagement, so operators can tweak
  them per-engagement without affecting other engagements, and clean up is a single directory.

## 3. The agent: Pi (not Bionic)

This project targets the **Pi coding agent** (`pi.dev`, `github.com/earendil-works/pi`), a
terminal-first agent whose config lives at `~/.pi/agent/` and whose model config file is
`models.json`. "Bionic" is LM Studio's own agent (a different product with a different config
layout at `~/.lmstudio/`). Skills are authored to the **Agent Skills standard** so they remain
portable across Pi, Claude Code, and Bionic.

Pi install: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`.

## 4. Configuration model (two-level agentDir)

Pi resolves its entire config directory via `PI_CODING_AGENT_DIR` (default `~/.pi/agent/`).
pi-glider uses a **two-level** model:

1. **Global template dir** — `~/.config/pi-glider/` (override with `PI_GLIDER_CONFIG`). Seeded from
   the repo by `scripts/install.sh` (or `scripts/pi-glider install`). This is where operators keep
   their canonical config, skills, and extensions. It is *not* mounted into the container directly.
2. **Per-engagement agentDir** — `<engagement>/.pi/`. Seeded once from the global dir by
   `scripts/pi-glider <dir>` (never clobbers an existing `.pi/`). This is what actually runs:
   - **Container mode** — mounted to `/root/.pi/agent` (with `PI_CODING_AGENT_DIR=/root/.pi/agent`).
   - **Host mode (`--no-container`)** — used directly via `PI_CODING_AGENT_DIR=<engagement>/.pi`.

This cleanly separates the pentest agent's config/skills from the operator's normal Pi config, and
isolates engagements from each other. Edit the engagement `.pi/` during an engagement; copy changes
back to the global dir to reuse them later.

```
~/.config/pi-glider/          (global template dir)
├── models.json        # inference providers/models (LAN server, LM Studio, etc.)
├── settings.json      # Pi settings (skill paths, tool prefs; sandbox disabled)
├── mcp.json           # MCP servers (Burp over SSE, etc.)
├── APPEND_SYSTEM.md   # appended system prompt (injected every turn)
├── methodology-tips.md # operator-editable general testing heuristics
├── context-inject.json # ctx-injector onStart/onCompact file lists
├── skills/            # skills (core/ operating manuals + recon/testing/tools/mcp/workflows)
├── prompts/           # prompt templates (optional, operator-defined)
└── extensions/        # extensions (pi-mcp-extension, pi-glider-banner, pi-ctx-injector)
```

The repo is the canonical/versioned source of truth; `scripts/install.sh` seeds the global dir from
`config/`, `skills/`, and `extensions/`.

## 5. MCP

Pi does not ship MCP built-in; it is supplied by an extension. pi-glider standardizes on
**`pi-mcp-extension`** (`pi install npm:pi-mcp-extension`), which supports `stdio`,
`streamable-http`, and `sse` transports with per-server configurability (timeouts, lifecycle,
health checks).

Config is read from the agentDir's `mcp.json` (the per-engagement `.pi/mcp.json`). See
`config/mcp.json` for the shape.

`pi-mcp-extension` is baked into the image at build time (global npm) and registered via
`config/settings.json` (`packages`). It is not installed at runtime, so it survives container
teardown.

Burp is the assumed default MCP server (team standard), reached over SSE. Operators can add any
other MCP servers by editing `mcp.json`.

Burp's MCP server rejects non-localhost `Host` headers (hardcoded DNS-rebinding protection in
`KtorServerManager.kt`: `Host`/`Origin`/`Referer` must be `localhost` or `127.0.0.1`, and the port
must match). This is a hard guardrail — changing Burp's listen address to `0.0.0.0` does not bypass
it, because the check is on the `Host` header value, not the bind interface. The container reaches
the host via `host.docker.internal`, which Burp rejects with `403`.

To work around it, the container reaches Burp through a small host-side bridge
(`scripts/burp-mcp-bridge.py`) that rewrites the `Host` header to `127.0.0.1:9876` on **every**
request (not just the first), so HTTP keep-alive connections work. `config/mcp.json` points at the
bridge (`host.docker.internal:9877`), which forwards to Burp on `127.0.0.1:9876`. On Linux,
`--network=host` can reach Burp directly instead (no bridge needed).

## 6. Networking

Default is the **bridge network** (container mode). Host-side services are reached via
`host.docker.internal`; LAN hosts (inference servers) are reachable by LAN IP through the bridge.

| Host | Reaching host services | Reaching LAN inference | Notes |
|------|------------------------|------------------------|-------|
| macOS | `host.docker.internal` | LAN IP via bridge | `--network=host` not supported by Docker Desktop |
| Linux | `host.docker.internal` (or `--network=host`) | LAN IP via bridge (or `--network=host`) | `--network=host` is an optional variant |

Consequences (container mode):

- `models.json` `baseUrl` for LM Studio on the host: `http://host.docker.internal:1234/v1`
  (or the LAN IP of the inference desktop).
- `mcp.json` Burp SSE URL: `http://host.docker.internal:<port>/...`.

**Host mode (`--no-container`)** has no bridge: `host.docker.internal` does not resolve, so
`mcp.json` must point Burp at `http://127.0.0.1:9876` (no bridge needed), and inference reaches
the host/LAN server directly (e.g. `http://127.0.0.1:1234/v1` or the LAN IP).

## 7. Sandboxing

The container is the sandbox. Pi's own sandbox extension is **not** enabled. This means the agent
has full network/process access *inside the container*, which is the intended posture for a
pentest agent — the container boundary (plus the operator's `RoE.md`) is what contains it. In
`--no-container` mode there is no container boundary; use it only for engagements whose tooling
requires host access (e.g. ADB for mobile) and rely on `RoE.md` + the operator.
