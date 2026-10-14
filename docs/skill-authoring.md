# Skill authoring

pi-glider skills follow the [Agent Skills standard](https://agentskills.io/specification). A skill
is a folder containing a `SKILL.md` file with YAML front matter. Skills are portable across Pi,
Claude Code, and Bionic.

## Structure

```
skills/
├── core/        operational/meta: engagement lifecycle, scope, evidence, safety
├── recon/       recon: discovery (subdomains/DNS), infrastructure (CIDR/cloud/ASN), scanning (ports), web (HTTP probe + fingerprint + JS)
├── testing/     active testing: web-map, owasp-top10, access-control, injection, misconfig, nuclei
└── tools/       a single `tooling` reference (which tool, key flags, integrations)
```

Each skill is a directory:

```
skills/recon/recon-web/
├── SKILL.md          # entry point (required)
└── reference.md      # optional supporting file (progressive disclosure)
```

## Front matter

Only `name` and `description` are required:

```yaml
---
name: recon-web
description: Probe live hosts with httpx, fingerprint TLS with tlsx, and crawl with katana.
---
```

- `name` — kebab-case, must match the folder name.
- `description` — the single most important field. It is what the model uses to decide when to
  load the skill. Keep it ≤ ~150 chars, written for someone with no project context. State the
  *purpose* and *when to use it*, not the implementation.

> **Colons in descriptions**: Pi's YAML parser treats an unquoted `: ` (colon + space) as a nested
> mapping, which breaks skill loading. If a description contains a colon, use the `|-` block scalar
> (strip) so the colon is preserved without a trailing newline:
>
> ```yaml
> description: |-
>   Reference for naabu: fast port scanning.
> ```

## Progressive disclosure

`SKILL.md` is the entry point and should be self-contained for the common case. Put long
reference material (full flag lists, cheat sheets, wordlists) in supporting files inside the skill
folder and reference them from `SKILL.md`. The model reads them only when needed.

## Writing a multi-step procedure

A multi-step procedure is just a richer recon/testing skill in `recon/` or `testing/` that
chains several tool invocations in one workflow, with the same `name` + `description` front
matter (e.g. `recon-web` chains httpx → tlsx → katana).

## Conventions

- Prefer ProjectDiscovery tools (installed via pdtm) as the default tooling; note alternatives.
- Always write output to the engagement directory (`/engagement/recon/...`), never into the repo
  or the agentDir.
- Respect `RoE.md` scope: a skill should state how it stays in scope and when to stop/confirm.
- Keep descriptions short and unambiguous; avoid "A, but not B" phrasing.
