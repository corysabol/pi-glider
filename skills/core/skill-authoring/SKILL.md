---
name: skill-authoring
description: How to author, extend, and organize pi-glider skills and reusable workflows using the Agent Skills standard.
---

# Skill authoring

Use this skill when creating, editing, or reorganizing pi-glider skills or operator-defined
workflows.

## Standard

Skills follow the [Agent Skills standard](https://agentskills.io/specification): a folder with a
`SKILL.md` containing YAML front matter (`name` and `description` are required).

## Layout

Place skills under the appropriate category in the repo's `skills/` tree:

- `core/` — operational/meta (engagement, scope, evidence, safety, authoring)
- `recon/` — recon techniques
- `testing/` — active testing
- `tools/` — per-tool reference
- `mcp/` — Burp/Caido MCP integration
- `workflows/` — operator-defined reusable workflows

## Front matter

```yaml
---
name: <kebab-case, matches folder name>
description: <short purpose + when to use it, ≤ ~150 chars>
---
```

The `description` is what the model uses to decide when to load the skill. Write it for someone
with no project context.

## Progressive disclosure

Keep `SKILL.md` self-contained for the common case. Put long reference material (flag lists,
cheat sheets, wordlists) in supporting files in the skill folder and reference them from
`SKILL.md`.

## Workflows

A reusable workflow is a skill in `workflows/` that documents a multi-step procedure as a sequence
of tool invocations and skill references.

## Conventions

- Default to ProjectDiscovery tools; note alternatives.
- Write output to `/engagement/...`, never into the repo or agentDir.
- State how the skill stays in scope and when to stop/confirm.
