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
for f in config/models.json config/mcp.json config/settings.json; do
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

### A5. Seed the live agentDir

```bash
./scripts/install.sh
ls -la ~/.config/pi-glider/
```

Expect `models.json`, `mcp.json`, `settings.json`, and a populated `skills/`. Re-run with `--force`
to overwrite config files you've edited.

### A6. Point config at your environment

```bash
$EDITOR ~/.config/pi-glider/models.json   # set baseUrl to your inference endpoint
$EDITOR ~/.config/pi-glider/mcp.json      # set the Burp MCP URL (see Part E)
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
docker run --rm -v ~/.config/pi-glider:/root/.pi/agent --entrypoint bash pi-glider:latest \
  -c 'pi --list-models'
```

Expect a table with your providers and models (e.g. `lan-inference` / `lm-studio`).

### C2. Extension is registered

```bash
docker run --rm -v ~/.config/pi-glider:/root/.pi/agent --entrypoint bash pi-glider:latest \
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
docker run --rm -v ~/.config/pi-glider:/root/.pi/agent --entrypoint bash pi-glider:latest -c \
  'pi -p "Reply with exactly: OK" --model lmstudio/qwen/qwen3.8-27b --no-session'
```

Substitute the model id with one from `pi --list-models` (the `--model` value is `provider/model-id`).
Expect the model to reply (e.g. `OK`). This proves end-to-end inference through the container.

### D4. Interactive test (optional)

```bash
./scripts/pi-glider.sh ~/engagements/<name>
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

### E2. Reachability + the Host-header check

```bash
docker run --rm --entrypoint bash pi-glider:latest \
  -c 'curl -s -o /dev/null -w "%{http_code}\n" http://host.docker.internal:9876/'
```

- `200` → Burp already accepts the container; skip to E4.
- `403` → Burp validates the `Host` header and rejects `host.docker.internal`. Apply E3.

### E3. Allow the container to reach Burp

Burp's MCP server listens on `127.0.0.1` and rejects non-localhost `Host` headers. Options:

1. **Change the listen host** — in the MCP Server extension's *Advanced options*, set the host to
   `0.0.0.0` (or your host IP), reload the extension, and re-run E2. This is the simplest fix.
2. **External-access fork** — if the stock extension still rejects after (1), use a fork that
   patches external access (e.g. `mcp-server-external-access`).
3. **Linux only** — use `--network=host` and connect to `http://127.0.0.1:9876` directly (the
   `Host` header then matches and is accepted). Not available on Docker Desktop for Mac.

### E4. Point mcp.json at Burp

```bash
$EDITOR ~/.config/pi-glider/mcp.json
```

Set `mcpServers.burp.url` to `http://host.docker.internal:9876` (SSE is at the root path, not
`/sse`). On Linux with `--network=host`, use `http://127.0.0.1:9876`.

### E5. Confirm the MCP server connects (interactive)

```bash
./scripts/pi-glider.sh ~/engagements/<name>
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

### F1. Launch via the wrapper

```bash
./scripts/pi-glider.sh ~/engagements/<name>
```

The wrapper mounts `~/.config/pi-glider` → `/root/.pi/agent`, the engagement dir → `/engagement`,
and `<engagement>/sessions` → `/root/.pi/agent/sessions`.

### F2. Verify mounts + sessions

From inside a session (or a shell):

```bash
docker run --rm --entrypoint bash pi-glider:latest -c 'ls -la /engagement /root/.pi/agent'
```

Expect `/engagement` to contain `RoE.md` and `/root/.pi/agent` to contain your config + skills.
After a session, confirm Pi session files land in `~/engagements/<name>/sessions/`.

---

## Part G — Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `pi --list-models` empty | wrong `baseUrl`/`apiKey` in `models.json` | fix `baseUrl`; keyless servers need a dummy `apiKey` |
| inference `pi -p` hangs | server not reachable from container | verify D2; use `host.docker.internal` (host) or LAN IP |
| Burp MCP `403` | Host-header validation | see E3 |
| Burp MCP `/mcp` shows disconnected | `lifecycle: lazy` (not yet used) | `/mcp:start burp`, or use a Burp tool |
| tools `MISSING` | image rebuilt before tool list change | rebuild (B1) |
| extension missing after teardown | installed at runtime (not baked in) | add to Dockerfile + `config/settings.json` `packages`, rebuild |
