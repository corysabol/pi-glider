---
name: mcp-burp
description: Use the Burp Suite MCP server (over SSE) for in-depth web testing of in-scope targets.
---

# Burp MCP

Burp Suite is exposed to the agent via `pi-mcp-extension` over SSE (see `config/mcp.json`).
Its tools appear as `mcp_burp_*`.

## Usage

- Check status with `/mcp` and `/mcp burp` (pi-mcp-extension commands).
- Use Burp MCP tools to: send requests, read proxy history, manage scope, and run scans.
- Prefer Burp for manual-style testing of specific endpoints discovered during recon.

## Scope

- Only test in-scope targets. Align every action with `/engagement/RoE.md`.
