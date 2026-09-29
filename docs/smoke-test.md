# Smoke test & validation guide

Step-by-step validation of the pi-glider project, from repo state through the container, inference,
and Burp MCP. Run top to bottom; each step lists the command, what to expect, and what it confirms.

## 0. Prerequisites

- Docker (Desktop) and `git`.
- For inference: LM Studio (or your LAN inference server) running and serving an OpenAI-compatible
  endpoint (`/v1/models`).
- For Burp MCP: Burp Suite with the **MCP Server** extension loaded (PortSwigger BAppStore).

---

## Part A — Validate project state (no services needed)

### A1. Git state is clean

```bash
git -C pi-glider status --short   # expect: no output (clean tree)
git -C pi-glider log --oneline    # expect: the Phase 0 / container / skills commits
```

### A2. Directory structure

```bash
cd pi-glider && find . -type f -not -path './.git/*' | sort
```

Expect the layout from `README.md`: `config/`, `skills/{core,recon,testing,tools,mcp,workflows}`,
`container/`, `templates/`, `scripts/`, `docs/`.

### A3. Config JSON is valid

```bash
for f in config/models.json config/mcp.json config/settings.json config/context-inject.json; do
  python3 -c "import json;json.load(open('$f'))" && echo "OK  $f"
done
```

### A4. Skills are well-formed

```bash
for d in $(find skills -name SKILL.md | sort); do
  name=$(sed -n 's/^name: *//p' "$d" | head -1)
  desc=$(sed -n 's/^description: *//p' "$d" | head -1)
  [ "$(basename "$(dirname "$d")")" = "$name" ] && [ -n "$desc" ] \
    && echo "OK  $(dirname "$d")" || echo "BAD $d"
done
```

Every skill's `name` must equal its folder name and have a non-empty `description`.

### A5. Seed the global agentDir

```bash
./scripts/pi-glider install     # or: ./scripts/install.sh
ls -la ~/.config/pi-glider/
```

Expect `models.json`, `mcp.json`, `settings.json`, `APPEND_SYSTEM.md`, `methodology-tips.md`,
`context-inject.json`, and populated `skills/` and `extensions/`. Re-run with `--force` to
overwrite config files you've edited.

### A6. Point config at your environment

```bash
$EDITOR ~/.config/pi-glider/models.json   # set baseUrl to your inference endpoint
$EDITOR ~/.config/pi-glider/mcp.json      # set the Burp MCP URL (see Part E)
```

### A7. Seed a per-engagement agentDir + install the CLI

The CLI seeds `<engagement>/.pi/` from the global dir on first launch. To seed it manually (useful
for the non-interactive checks in Parts C/D) — do this *after* A6 so your edits are included:

```bash
mkdir -p ~/engagements/acme && cp templates/engagement/RoE.md ~/engagements/acme/RoE.md
cp -R ~/.config/pi-glider ~/engagements/acme/.pi
mkdir -p ~/engagements/acme/.pi/sessions
ls -la ~/engagements/acme/.pi/
```

Expect `.pi/` to contain `models.json`, `mcp.json`, `settings.json`, `APPEND_SYSTEM.md`,
`methodology-tips.md`, `context-inject.json`, and `skills/`/`extensions/`/`sessions/`.

To put the CLI on your PATH:

```bash
./scripts/pi-glider self-install   # symlinks to ~/.local/bin/pi-glider
which pi-glider                    # expect ~/.local/bin/pi-glider
```

---

## Part B — Build the image

### B1. Build

```bash
docker build -t pi-glider:latest container/
```

Expect a successful build (no errors). Rebuild after any change to `container/`.

### B2. Verify image contents

```bash
docker run --rm --entrypoint bash pi-glider:latest -c '
  node --version
  pi --version
  for t in subfinder naabu httpx katana nuclei dnsx uncover tlsx cdncheck asnmap mapcidr interactsh-client proxify notify; do
    command -v "$t" >/dev/null && echo "OK  $t" || echo "MISSING  $t"
  done
  ls /usr/local/lib/node_modules   # expect: pi-mcp-extension
'
```

Expect node v22.x, pi 0.x, all 14 tools `OK`, and `pi-mcp-extension` present.

---

## Part C — Config + extension registration

### C1. Models resolve

```bash
docker run --rm -v ~/engagements/acme/.pi:/root/.pi/agent --entrypoint bash pi-glider:latest \
  -c 'pi --list-models'
```

Expect a table with your providers and models (e.g. `lmstudio` / `qwen/qwen3.8-27b`).

### C2. Extension is registered

```bash
docker run --rm -v ~/engagements/acme/.pi:/root/.pi/agent --entrypoint bash pi-glider:latest \
  -c 'pi list'
```

Expect `npm:pi-mcp-extension` resolved to `/usr/local/lib/node_modules/pi-mcp-extension`.

---

## Part D — Validate inference

> Confirmed working (this environment): model `qwen/qwen3.8-27b` via `http://host.docker.internal:1234/v1`
> (host LM Link → desktop). The desktop is also reachable directly at `http://192.168.1.158:1234/v1`.

### D1. Confirm the inference server is up

From the host, check the OpenAI-compatible endpoint:

```bash
curl -s http://127.0.0.1:1234/v1/models        # LM Studio default port
curl -s http://<LAN-IP>:1234/v1/models        # or your LAN inference server
```

Expect a JSON list of models. If empty/refused, start LM Studio (Local Server enabled) or your
LAN server first.

### D2. Confirm reachability from inside the container

```bash
docker run --rm --entrypoint bash pi-glider:latest \
  -c 'curl -s -o /dev/null -w "%{http_code}\n" http://host.docker.internal:1234/v1/models'
```

Expect `200`. (For a LAN server, curl the LAN IP directly — the bridge network reaches LAN hosts.)

### D3. Non-interactive inference test

```bash
docker run --rm -v ~/engagements/acme/.pi:/root/.pi/agent --entrypoint bash pi-glider:latest -c \
  'pi -p "Reply with exactly: OK" --model lmstudio/qwen/qwen3.8-27b --no-session'
```

Substitute the model id with one from `pi --list-models` (the `--model` value is `provider/model-id`).
Expect the model to reply (e.g. `OK`). This proves end-to-end inference through the container.

### D4. Interactive test (optional)

```bash
./scripts/pi-glider ~/engagements/acme
```

Attach to the TUI, select the model, and send a prompt. Confirm a response.

---

## Part E — Validate Burp MCP

### E1. Confirm the Burp MCP server is running

In Burp: load the **MCP Server** extension (BAppStore), note its URL. Default:

```
http://127.0.0.1:9876
```

Verify from the host:

```bash
curl -s -m 3 -N http://127.0.0.1:9876/ | head -3
```

Expect an SSE stream beginning with `event: endpoint` (the MCP handshake).

### E2. Start the Host-rewriting bridge

Burp's MCP server rejects non-localhost `Host` headers (hardcoded DNS-rebinding protection in
`KtorServerManager.kt`: only `localhost`/`127.0.0.1` are allowed for `Host`/`Origin`/`Referer`).
Changing Burp's listen address to `0.0.0.0:9876` does **not** help — the guard checks the `Host`
header value, not the bind interface. The container reaches the host via `host.docker.internal`,
which Burp rejects with `403`.

Run the bridge on the host:

```bash
python3 scripts/burp-mcp-bridge.py
```

It listens on `0.0.0.0:9877` and forwards to `127.0.0.1:9876`, rewriting the `Host` header to
`127.0.0.1:9876` on **every** request (not just the first), so HTTP keep-alive connections work.
The MCP SSE flow is: `GET /` returns `event: endpoint` with a `sessionId`, then each `POST /?sessionId=…`
carries that id as a query param. The bridge rewrites the `Host` on all of those POSTs.

### E3. Verify the bridge from the container

```bash
docker run --rm --add-host=host.docker.internal:host-gateway --entrypoint bash pi-glider:latest \
  -c 'curl -s -m 3 -N -i http://host.docker.internal:9877/ | head -12'
```

Expect `HTTP/1.1 200` with `Content-Type: text/event-stream` (the MCP handshake).

### E3b. Verify the full POST flow (handshake + tool list)

The GET alone is not enough — Burp rejects POSTs aggressively, and the bridge must rewrite `Host`
on the follow-up POSTs too. Confirm the full SSE session works end-to-end with the MCP SDK:

```bash
docker run --rm --add-host=host.docker.internal:host-gateway \
  --entrypoint bash pi-glider:latest -c '
  node --input-type=module -e "
    const SDK = \"/usr/local/lib/node_modules/pi-mcp-extension/node_modules/@modelcontextprotocol/sdk/dist/cjs\";
    const { Client } = await import(SDK + \"/client/index.js\");
    const { SSEClientTransport } = await import(SDK + \"/client/sse.js\");
    const c = new Client({ name: \"t\", version: \"1\" });
    await c.connect(new SSEClientTransport(new URL(\"http://host.docker.internal:9877\")));
    const tools = await c.listTools();
    console.log(\"TOOLS:\", tools.tools.map(t => t.name).join(\", \"));
    await c.close();
  "
'
```

Expect a list of `mcp_burp_*` tools (e.g. `get_proxy_http_history`, `send_http1_request`, …).
This proves the bridge rewrites `Host` on the keep-alive POSTs, not just the initial GET.

### E4. Point mcp.json at the bridge

```bash
$EDITOR ~/engagements/acme/.pi/mcp.json
```

Set `mcpServers.burp.url` to `http://host.docker.internal:9877`. (On Linux you can instead use
`--network=host` and point directly at `http://127.0.0.1:9876`.) Edit the per-engagement
`.pi/mcp.json` — that is what the container mounts. If you already set it in A6 before seeding,
this should already be correct.

### E5. Confirm the MCP server connects (interactive)

```bash
./scripts/pi-glider ~/engagements/acme
```

In the Pi TUI:

```
/mcp          # status summary — expect `burp` listed
/mcp burp     # detail + stderr log for burp
/mcp:start burp   # force a connection if lifecycle is lazy
```

### E6. Exercise a Burp tool

With inference working, ask the agent to use a Burp MCP tool (e.g. "list the proxy history via
Burp"). Tools appear as `mcp_burp_*`. Confirm the tool returns real data.

---

## Part F — Full launch

### F1. Launch via the CLI

```bash
./scripts/pi-glider ~/engagements/acme
```

The CLI seeds `<engagement>/.pi/` (if needed), starts the Burp bridge (container mode), and mounts
`<engagement>/.pi` → `/root/.pi/agent` and the engagement dir → `/engagement`.

### F2. Verify mounts + sessions

From inside a session (or a shell):

```bash
docker run --rm --entrypoint bash pi-glider:latest -c 'ls -la /engagement /root/.pi/agent'
```

Expect `/engagement` to contain `RoE.md` and `/root/.pi/agent` to contain your config + skills.
After a session, confirm Pi session files land in `~/engagements/<name>/.pi/sessions/`.

---

## Part G — Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `pi --list-models` empty | wrong `baseUrl`/`apiKey` in `models.json` | fix `baseUrl`; keyless servers need a dummy `apiKey` |
| inference `pi -p` hangs | server not reachable from container | verify D2; use `host.docker.internal` (host) or LAN IP |
| Burp MCP `403` | Host-header validation (DNS-rebinding) | run the bridge (E2) |
| Burp MCP `/mcp` shows disconnected | `lifecycle: lazy` (not yet used) | `/mcp:start burp`, or use a Burp tool |
| tools `MISSING` | image rebuilt before tool list change | rebuild (B1) |
| extension missing after teardown | installed at runtime (not baked in) | add to Dockerfile + `config/settings.json` `packages`, rebuild |
