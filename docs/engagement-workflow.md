# Engagement workflow

## Lifecycle

1. **Create the engagement dir.** `mkdir -p ~/engagements/<name>/` and copy the RoE template:
   `cp templates/engagement/RoE.md ~/engagements/<name>/RoE.md`. Fill it in.
2. **Launch the agent** with the CLI, which seeds a per-engagement `.pi/` agentDir (from the global
   `~/.config/pi-glider/`) and then runs Pi:
   - Container (default): `scripts/pi-glider ~/engagements/<name>`
   - Host: `scripts/pi-glider --no-container ~/engagements/<name>`
3. **Connect.** The agent connects to the configured inference API (`models.json`) and any MCPs
   (`mcp.json`).
4. **Operate.** Attach to the Pi session and request tasks / trigger skills. The agent follows a
   phased methodology (see below): orient → recon → plan → confirm → test → document.
5. **Accumulate.** Working files (discovered IPs, hosts, recon output) and Pi session history
   accumulate in the engagement dir; the agent aligns against `RoE.md` for scope.
6. **Teardown.** Remove the container (or exit the host session). Evidence + session history
   persist in the engagement dir (session history under `.pi/sessions/`).

## Engagement directory layout

```
~/engagements/<name>/
├── RoE.md          # source of truth: scope, RoE, targets, goals
├── recon/          # recon output (subdomains, ports, probes, crawls)
├── evidence/       # screenshots, findings, artifacts
├── notes/          # working notes
└── .pi/            # per-engagement agentDir (seeded once from ~/.config/pi-glider/)
    ├── models.json / mcp.json / settings.json
    ├── APPEND_SYSTEM.md / methodology-tips.md / context-inject.json
    ├── skills/  extensions/
    └── sessions/   # Pi session history
```

The `.pi/` agentDir is seeded once on first launch and never clobbered, so per-engagement tweaks to
skills/config persist for that engagement. Copy changes back to `~/.config/pi-glider/` to reuse
them on future engagements.

## Operating methodology

The agent follows a phased workflow on every task (encoded in `skills/core/pi-glider/SKILL.md`):

1. **Orient** — read `RoE.md` and reconcile the request against scope/goals.
2. **Recon** — map the attack surface (subdomains, DNS, IPs, ports, HTTP, fingerprints, JS,
   cloud). Gather as much as possible; no exploitation yet.
3. **Plan** — write a prioritized plan to `notes/plan.md` and present it to the operator for
   confirmation/tweaks.
4. **Test / exploit** — only after the operator confirms the plan.
5. **Document** — write each confirmed finding in full (with reproduction steps) to `evidence/`
   using the finding template (`templates/engagement/finding.md`).

The plan-and-confirm gate is deliberate: it keeps the agent from chasing every rabbit hole and
lets the operator steer before any active testing.

## RoE.md is the source of truth

The agent aligns every action against `RoE.md`. Working files may add newly discovered hosts/IPs,
but the RoE remains the authority on what is *in scope*. If a request would exceed scope, the agent
must confirm with the operator before proceeding.

`RoE.md` sections: engagement metadata, authorization, scope (in/out), rules of engagement, target
descriptions, goals/objectives, reporting requirements, and a change log.
