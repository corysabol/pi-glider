# pi-glider — Phase 0 Implementation Plan

> A containerized, Pi-based penetration-testing agent. Kali Linux container + ProjectDiscovery toolchain + Burp/Caido MCP, driven by a Pi coding-agent session that aligns against an operator-authored `RoE.md`.

---

## 1. Does this make sense? (validation)

Yes — the architecture is sound and well-scoped. A few refinements and one correction are folded into this plan:

- **Correct.** Containerizing gives you sandboxing *and* clean evidence preservation/teardown. The engagement dir as a bind mount is the right boundary: everything disposable lives in the container, everything that must survive lives in the mount.
- **Correct.** `RoE.md` as the single source of truth is the right call. It keeps the agent scoped and gives the operator a clean, auditable control surface.
- **Refinement — "Pi" vs "Bionic".** There are two different agents in play. This project targets the **Pi coding agent** (`pi.dev`, `github.com/earendil-works/pi`), whose config lives at `~/.pi/agent/` and whose config file is literally `models.json` — which matches your description. "Bionic" is LM Studio's own agent (the harness this conversation runs in) and has a *different* config layout (`~/.lmstudio/`). This plan assumes **Pi**, and skills are authored to the **Agent Skills standard** (`agentskills.io`), so they remain portable across Pi, Claude Code, Bionic, etc.
- **Refinement — MCP is not built into Pi.** Pi's philosophy is "no MCP built-in"; MCP is supplied by an extension. We standardize on **`pi-mcp-extension`**, which supports `stdio`, `streamable-http`, and `sse` transports with per-server configurability (timeouts, lifecycle, health checks) — exactly what we need for Burp over SSE. This extension is installed into the container image.
- **Refinement — profiles.** See §3.1. Short version: you don't need profiles; a dedicated agentDir mounted into the container is simpler and cleaner.
- **Correction — `--network=host` on macOS.** You are on Darwin. Docker Desktop for Mac does **not** implement `--network=host`. Host-side services (Burp/Caido MCP, LM Studio) must be reached via `host.docker.internal`; LAN inference servers are reachable through the default bridge. `--network=host` is only available on a Linux host (or a Linux VM/lima/colima). See §5.2.

---

## 2. Architecture (confirmed)

```
Operator host
├── ~/.config/pi-glider/            # live agentDir (models.json, mcp.json, skills/, settings.json, sessions/)
├── ~/engagements/<name>/           # per-engagement dir (RoE.md + working files + evidence)
│     └── RoE.md                    # source of truth: scope, RoE, targets, goals
└── Burp Suite / Caido (MCP over SSE) + LAN inference server

Kali Linux container (disposable)
├── /root/.pi/agent   ← bind-mount ~/.config/pi-glider/   (Pi agentDir)
├── /engagement       ← bind-mount ~/engagements/<name>/  (working dir + evidence)
├── Pi coding agent (TUI session the operator attaches to)
├── ProjectDiscovery toolchain (installed via pdtm)
└── pi-mcp-extension → SSE to host Burp MCP
```

Key properties:

- **Disposable container, durable evidence.** Everything in the container can be thrown away; the engagement dir and the agentDir survive on the host.
- **Scoped agent.** The agent aligns against `RoE.md`; working files (new IPs/hosts discovered during recon) accumulate in the engagement dir but never override the RoE as the authority on *what is in scope*.
- **Config pulled from host.** The containerized agent's config/skills come from a host directory, so operators edit skills and tool preferences without rebuilding the image.

---

## 3. Configuration & profiles

### 3.1 Answer to "does Pi support profiles?"

Pi does **not** have a first-class `--profile` flag. But it resolves its entire config directory through the `PI_CODING_AGENT_DIR` environment variable (default `~/.pi/agent/`). That variable is the documented, supported mechanism, and the community `pi-profiles` package (`ppi`) simply wraps it (creating `~/.pi/profiles/<name>/` and launching Pi with the env var pointed there).

For pi-glider we don't need the profiles package at all. We create a **dedicated agentDir** and mount it into the container:

- Host: `~/.config/pi-glider/`
- Container: `/root/.pi/agent` (with `PI_CODING_AGENT_DIR=/root/.pi/agent` set explicitly for self-documentation)

This cleanly separates the pentest agent's config/skills from the operator's normal Pi config, which is exactly the isolation you wanted. It is simpler than profiles (no switcher tool) and fully supports the "config pulled from a host location and mounted" requirement.

### 3.2 agentDir layout (`~/.config/pi-glider/`)

Mirrors Pi's native agentDir so nothing is surprising:

```
~/.config/pi-glider/
├── models.json        # inference providers/models (LAN server, LM Studio, etc.)
├── settings.json      # Pi settings (sandbox, skills paths, tool prefs)
├── mcp.json           # MCP servers (Burp/Caido over SSE, etc.)
├── skills/            # global skills for the pentest agent
├── prompts/           # prompt templates (optional, operator-defined)
├── sessions/          # default session dir (redirected per-engagement via mount)
└── extensions/        # installed extensions (pi-mcp-extension, etc.)
```

The repo is the canonical/versioned source of truth; `scripts/install.sh` seeds `~/.config/pi-glider/` from `config/` (copy by default, `--symlink` optional). Operators edit their live copy freely.

---

## 4. Repository / project structure

```
pi-glider/
├── README.md
├── phase0_implementation_plan.md        # this document
├── docs/
│   ├── architecture.md
│   ├── engagement-workflow.md
│   └── skill-authoring.md
├── config/                              # canonical agentDir (seeded to ~/.config/pi-glider/)
│   ├── models.json
│   ├── settings.json
│   ├── mcp.json
│   ├── skills/                          # → copied to ~/.config/pi-glider/skills/
│   └── prompts/
├── skills/                              # source-of-truth skill definitions (versioned)
│   ├── core/
│   ├── recon/
│   ├── testing/
│   ├── tools/
│   ├── mcp/
│   └── workflows/
├── container/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── entrypoint.sh
│   └── install/                         # pdtm install + baseline tool list
├── templates/
│   └── engagement/
│       ├── RoE.md                       # RoE template
│       └── .gitignore
└── scripts/
    ├── install.sh                       # seed ~/.config/pi-glider/
    └── pi-glider.sh                     # optional convenience wrapper
```

> Decision: keep `skills/` as the versioned source of truth and have `install.sh` sync it into `config/skills/` (or directly into the live agentDir). This avoids two parallel copies drifting apart.
>
> The **entire repository** is versioned with git (not just `skills/`).

---

## 5. Container design

### 5.1 Image

- Base: `kalilinux/kali-rolling` (or `kali-last-release` for stability).
- Install Node.js runtime and the Pi CLI (`npm install -g --ignore-scripts @earendil-works/pi-coding-agent`).
- Install `pi-mcp-extension` (`pi install npm:pi-mcp-extension`).
- Install `pdtm` (ProjectDiscovery Tool Manager) and the baseline tool set. Tools are **not** version-pinned; operators may install additional tools at runtime.

**Phase 0 tool set (via pdtm):** `subfinder`, `naabu`, `httpx`, `katana`, `nuclei`, `dnsx`, `uncover`, `tlsx`, `cdncheck`, `asnmap`, `mapcidr`, `interactsh-client`, `proxify`, `notify`. (Full list finalized in Phase 1 when skills are written against them.)

### 5.2 Networking

Default to the **bridge network**. Host-side services are reached via `host.docker.internal`; LAN hosts (inference servers) are reachable by LAN IP through the bridge.

| Host | Reaching host services | Reaching LAN inference | Notes |
|------|------------------------|------------------------|-------|
| macOS (you) | `host.docker.internal` | LAN IP via bridge | `--network=host` is not supported by Docker Desktop |
| Linux | `host.docker.internal` (or `--network=host`) | LAN IP via bridge (or `--network=host`) | `--network=host` is an optional variant |

Consequences:

- `models.json` `baseUrl` for LM Studio on the host: `http://host.docker.internal:1234/v1` (or the LAN IP of the inference desktop).
- `mcp.json` Burp SSE URL: `http://host.docker.internal:<port>/...`.
- A Linux `--network=host` variant is documented in `docker-compose.yml` but not the default.

### 5.3 Mounts

```
-v ~/.config/pi-glider:/root/.pi/agent                      # agentDir (config + skills)
-v ~/engagements/<name>:/engagement                         # working dir + evidence
-v ~/engagements/<name>/sessions:/root/.pi/agent/sessions   # Pi sessions → engagement dir
```

`entrypoint.sh` sets `PI_CODING_AGENT_DIR=/root/.pi/agent`, `cd /engagement`, and drops into the Pi TUI.

---

## 6. Config file specs

### 6.1 `models.json` (illustrative)

```json
{
  "providers": {
    "lan-inference": {
      "baseUrl": "http://host.docker.internal:1234/v1",
      "api": "openai-completions",
      "apiKey": "lm-studio",
      "compat": { "supportsDeveloperRole": false },
      "models": [
        { "id": "qwen2.5-coder-32b", "contextWindow": 32768 }
      ]
    }
  }
}
```

Notes: `apiKey` is a placeholder for keyless local servers; `compat.supportsDeveloperRole=false` for OpenAI-compatible backends that reject the `developer` role. LAN servers use their LAN IP instead of `host.docker.internal`.

### 6.2 `mcp.json` (pi-mcp-extension shape)

`pi-mcp-extension` reads `~/.pi/agent/mcp.json` (global, our mounted agentDir) and `.pi/mcp.json` (project override, shallow-merged per-server). Transports: `stdio`, `streamable-http`, `sse`.

```json
{
  "settings": {
    "toolPrefix": "mcp",
    "requestTimeoutMs": 30000,
    "maxRetries": 5
  },
  "mcpServers": {
    "burp": {
      "transport": "sse",
      "url": "http://host.docker.internal:8090/sse",
      "lifecycle": "lazy"
    }
  }
}
```

Burp is the assumed default, but this is just config — operators add whatever MCP servers they want.

### 6.3 `settings.json`

Minimal Phase 0 content: skill paths and any tool preferences. **Pi's sandbox is disabled** — the container is the sandbox. Exact keys finalized against the installed Pi version during implementation.

---

## 7. SKILL framework

### 7.1 Authoring conventions

- Skills follow the **Agent Skills standard**: a folder containing `SKILL.md` with YAML front matter (`name`, `description` required).
- `description` is the single most important field — it is what the model uses to decide when to load a skill. Keep it ≤ ~150 chars, written for someone with no project context.
- Progressive disclosure: `SKILL.md` is the entry point; supporting files (reference docs, scripts, wordlists) live in the skill folder.
- Skills are written to the standard so they work in Pi, Claude Code, and Bionic alike (the operator can even develop/test them in this harness).

### 7.2 Skill taxonomy (where future skills live)

| Category | Purpose |
|----------|---------|
| `core/` | Operational/meta: engagement lifecycle, scope enforcement, evidence handling, safety, skill-authoring |
| `recon/` | Recon techniques: subdomain, port, HTTP probe, crawl, fingerprint, JS analysis, cloud, DNS |
| `testing/` | Active testing: nuclei, fuzzing, auth, injection, misconfig |
| `tools/` | Per-tool reference (subfinder, naabu, httpx, katana, nuclei, dnsx, …) |
| `mcp/` | Burp/Caido MCP integration patterns |
| `workflows/` | Operator-defined reusable multi-step workflows |

### 7.3 Phase 0 skills (deliverables)

Phase 0 establishes the framework plus a small set of foundational skills; the full recon/testing catalog is Phase 1+.

1. **`pi-glider`** (core) — the operating manual: how the agent works, `RoE.md` is the source of truth, scope enforcement rules, evidence handling, safety/authorization gates. This is the "establishing the SKILL" anchor.
2. **`skill-authoring`** (core) — how operators write and extend skills and reusable workflows (enables the "operator-defined workflows" goal).
3. **`engagement-setup`** (core) — initialize an engagement dir, read/parse `RoE.md`, set up working-file conventions.
4. **`recon-subdomain-enumeration`** (recon, exemplar) — end-to-end subdomain enumeration with `subfinder`/`uncover`, proving the toolchain + skill pattern end to end.
5. **`recon-http-probe`** (recon, exemplar) — `httpx` live-host probing + `katana` crawling, proving the second tool and the "tool reference" pattern.

Each exemplar includes a `tools/`-style reference section so the pattern generalizes.

---

## 8. Engagement workflow

1. Operator creates `~/engagements/<name>/` and writes `RoE.md` (from `templates/engagement/RoE.md`).
2. Operator launches the container, mounting that dir to `/engagement` and `~/.config/pi-glider/` to `/root/.pi/agent`.
3. Agent connects to the configured inference API and any MCPs defined in `mcp.json`.
4. Operator attaches to the Pi session and requests tasks / triggers skills.
5. Working files (discovered IPs, hosts, recon output) and Pi session history accumulate in `/engagement`; the agent aligns against `RoE.md` for scope.
6. Teardown: remove the container; evidence + session history persist in the engagement dir on the host. Operators may also export sessions manually.

`RoE.md` template sections (Phase 0): engagement metadata, authorization, scope (in/out), rules of engagement, target descriptions, goals/objectives, reporting requirements, and a change log.

---

## 9. Phase 0 task breakdown

| # | Task | Output | Acceptance criteria |
|---|------|--------|---------------------|
| 1 | Scaffold repo structure | dirs + README + `.gitignore` | `tree` matches §4 |
| 2 | Write `docs/architecture.md` | doc | captures §2–§6 |
| 3 | Write `docs/skill-authoring.md` | doc | conventions + taxonomy + example |
| 4 | Write `docs/engagement-workflow.md` | doc | captures §8 |
| 5 | Author `config/models.json`, `config/mcp.json`, `config/settings.json` | config | valid JSON, documented fields |
| 6 | Author the 5 Phase 0 skills (§7.3) | `skills/**/SKILL.md` | each has valid front matter + description |
| 7 | Write `container/Dockerfile` + `entrypoint.sh` + `install/` | container | builds; pdtm installs baseline tools; Pi + pi-mcp-extension present |
| 8 | Write `container/docker-compose.yml` | compose | mounts + `host.docker.internal` documented; Linux host-net variant |
| 9 | Write `templates/engagement/RoE.md` | template | all §8 sections |
| 10 | Write `scripts/install.sh` (+ optional `pi-glider.sh`) | scripts | seeds `~/.config/pi-glider/` from `config/` |
| 11 | Smoke test | run | container builds; Pi launches; a model resolves; a skill loads; one MCP connects |
| 12 | Update `README.md` | doc | quickstart + workflow |

---

## 10. Open questions / risks

1. **Burp MCP endpoint.** Assume Burp (team default) over SSE; the `mcp/` skill layer stays transport-agnostic so operators can swap in Caido or others by editing `mcp.json`.
2. **MCP extension.** Standardize on `pi-mcp-extension`; verify its config precedence and SSE behavior against the installed Pi version during the smoke test.
3. **Pi sandbox.** Disabled — the container is the sandbox. Confirmed; no further work.
4. **Session/evidence location.** Pi sessions persist per-engagement (in the mounted engagement dir), with manual export available.
5. **macOS networking.** Confirm `host.docker.internal` reaches Burp MCP and LAN inference; document the Linux `--network=host` path separately.
6. **Tool set.** Baseline pdtm tool list is documented but **not** version-pinned; operators may install additional tools at runtime.

---

## 11. Roadmap (later phases)

- **Phase 1** — Full recon skill catalog (subdomain, port, HTTP, crawl, fingerprint, JS, cloud, DNS) + `tools/` reference skills + Burp MCP spike.
- **Phase 2** — Active testing skills (nuclei, fuzzing, auth, injection) + operator workflow skills + `notify`/`interactsh` integration.
- **Phase 3** — Evidence/reporting pipeline, engagement templating, multi-target orchestration, hardening.
