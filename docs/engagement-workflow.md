# Engagement workflow

## Lifecycle

1. **Create the engagement dir.** `mkdir -p ~/engagements/<name>/` and copy the RoE template:
   `cp templates/engagement/RoE.md ~/engagements/<name>/RoE.md`. Fill it in.
2. **Launch the container**, mounting the engagement dir to `/engagement` and the agentDir to
   `/root/.pi/agent` (plus the per-engagement `sessions/` dir).
3. **Connect.** The agent connects to the configured inference API (`models.json`) and any MCPs
   (`mcp.json`).
4. **Operate.** Attach to the Pi session and request tasks / trigger skills.
5. **Accumulate.** Working files (discovered IPs, hosts, recon output) and Pi session history
   accumulate in `/engagement`; the agent aligns against `RoE.md` for scope.
6. **Teardown.** Remove the container. Evidence + session history persist in the engagement dir.

## Engagement directory layout

```
~/engagements/<name>/
├── RoE.md          # source of truth: scope, RoE, targets, goals
├── recon/          # recon output (subdomains, ports, probes, crawls)
├── evidence/       # screenshots, findings, artifacts
├── notes/          # working notes
└── sessions/       # Pi session history (bind-mounted over /root/.pi/agent/sessions)
```

## RoE.md is the source of truth

The agent aligns every action against `RoE.md`. Working files may add newly discovered hosts/IPs,
but the RoE remains the authority on what is *in scope*. If a request would exceed scope, the agent
must confirm with the operator before proceeding.

`RoE.md` sections: engagement metadata, authorization, scope (in/out), rules of engagement, target
descriptions, goals/objectives, reporting requirements, and a change log.
