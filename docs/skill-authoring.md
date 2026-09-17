# Skill authoring

pi-glider skills follow the [Agent Skills standard](https://agentskills.io/specification). A skill
is a folder containing a `SKILL.md` file with YAML front matter. Skills are portable across Pi,
Claude Code, and Bionic.

## Structure

```
skills/
├── core/        operational/meta: engagement lifecycle, scope, evidence, safety, authoring
├── recon/       recon techniques: subdomain, port, HTTP, crawl, fingerprint, JS, cloud, DNS
├── testing/     active testing: nuclei, fuzzing, auth, injection, misconfig
├── tools/       per-tool reference (subfinder, naabu, httpx, katana, nuclei, dnsx, …)
├── mcp/         Burp/Caido MCP integration patterns
└── workflows/   operator-defined reusable multi-step workflows
```

Each skill is a directory:

```
skills/recon/recon-subdomain-enumeration/
├── SKILL.md          # entry point (required)
└── reference.md      # optional supporting file (progressive disclosure)
```

## Front matter

Only `name` and `description` are required:

```yaml
---
name: recon-subdomain-enumeration
description: Enumerate subdomains for in-scope targets using subfinder and uncover.
---
```

- `name` — kebab-case, must match the folder name.
- `description` — the single most important field. It is what the model uses to decide when to
  load the skill. Keep it ≤ ~150 chars, written for someone with no project context. State the
  *purpose* and *when to use it*, not the implementation.

## Progressive disclosure

`SKILL.md` is the entry point and should be self-contained for the common case. Put long
reference material (full flag lists, cheat sheets, wordlists) in supporting files inside the skill
folder and reference them from `SKILL.md`. The model reads them only when needed.

## Writing a reusable workflow

Operator-defined workflows are just skills in `workflows/`. A workflow skill documents a
multi-step procedure (e.g. "full external recon sweep") as a sequence of tool invocations and
skill references, with the same `name` + `description` front matter.

## Conventions

- Prefer ProjectDiscovery tools (installed via pdtm) as the default tooling; note alternatives.
- Always write output to the engagement directory (`/engagement/recon/...`), never into the repo
  or the agentDir.
- Respect `RoE.md` scope: a skill should state how it stays in scope and when to stop/confirm.
- Keep descriptions short and unambiguous; avoid "A, but not B" phrasing.
