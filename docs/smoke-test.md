# Smoke test & validation guide

Step-by-step validation of the pi-glider project, from repo state through the container, the Caido
proxy/UI, and inference. Run top to bottom; each step lists the command, what to expect, and what it
confirms.

## 0. Prerequisites

- Docker (Desktop) and `git`.
- For inference: LM Studio (or your LAN inference server) running and serving an OpenAI-compatible
  endpoint (`/v1/models`).
- Caido runs **in-container** — no host-side setup needed; just a web browser to open the UI.

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

Expect the layout from `README.md`: `config/`, `skills/{core,recon,testing,tools,workflows}`,
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
```

`config/mcp.json` is an empty placeholder (`{ "mcpServers": {} }`) — MCP is handled by Pi's native
`/mcp` command going forward; there is no Burp/extension MCP to configure.

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
  command -v caido-cli >/dev/null && echo "OK  caido-cli" || echo "MISSING  caido-cli"
'
```

Expect node v22.x, pi 1.x, all 14 tools `OK`, and `caido-cli` present.

---

## Part C — Config + extension registration

### C1. Models resolve

```bash
docker run --rm -v ~/engagements/acme/.pi:/engagement/.pi --entrypoint bash pi-glider:latest \
  -c 'pi --list-models'
```

Expect a table with your providers and models (e.g. `lmstudio` / `qwen/qwen3.8-27b`).

### C2. Legacy MCP extension is gone

```bash
docker run --rm -v ~/engagements/acme/.pi:/engagement/.pi --entrypoint bash pi-glider:latest \
  -c 'pi list'
```

Expect **no** `npm:pi-mcp-extension` entry (it was removed; MCP is now Pi's native `/mcp` command).

---

## Part D — Validate the Caido proxy & UI (in-container)

> The container starts a headless Caido instance as the web-proxy sidecar. Every proxy-aware client
> (Chromium via Playwright, `curl`, `wget`, Python `requests`, ProjectDiscovery tools) routes through
> it; the operator inspects captured traffic in the host browser at http://localhost:5000.

### D1. Launch the container + Caido readiness

```bash
./scripts/pi-glider ~/engagements/acme
```

The entrypoint should emit, before the Pi TUI starts:

```
[entrypoint] Caido up — UI: http://localhost:5000 | proxy: http://127.0.0.1:8080 (data: /engagement/.caido)
[entrypoint] proxy configured — http(s)_proxy/ALL_PROXY → http://127.0.0.1:8080; NO_PROXY=...
```

Also expect a line from `caido-init.js`: `caido-init: project "engagement" (<id>) selected` — this
is what gives captured traffic a home.

### D2. Operator UI is reachable from the host

```bash
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:5000/
```

Expect `200 text/html` (the Caido UI is being served, not proxied). Open
http://localhost:5000 in your host browser and log in / view the guest session.

### D3. HTTP proxying + capture

From inside the running container:

```bash
docker exec <container-id> curl -sS -o /dev/null -w '%{http_code}\n' http://example.com/
```

Expect `200`, and **the request appears in the Caido UI** (Proxy → HTTP history). The system-wide
`http_proxy` is what routes this through Caido — no explicit `-x` flag needed.

### D4. HTTPS interception is trusted (no `-k`)

```bash
docker exec <container-id> curl -sS -o /dev/null -w '%{http_code}\n' https://example.com/
```

Expect `200` with **no** certificate error — the baked EC (P-256) CA is trusted via
`REQUESTS_CA_BUNDLE`/`SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS`, and the request appears in Caido.

### D5. Playwright Chromium routes through Caido (proxy env)

```bash
docker exec -e CAIDO_CHROMIUM_ARGS="$CAIDO_CHROMIUM_ARGS" <container-id> \
  node -e '
    const { chromium } = require("playwright");
    (async () => {
      const b = await chromium.launch({ args: (process.env.CAIDO_CHROMIUM_ARGS||"").split(" ").filter(Boolean) });
      const p = await b.newPage();
      await p.goto("http://example.com/");
      console.log("title:", await p.title());
      await b.close();
    })();
  '
```

Expect the page title to print, and the request to show up in Caido (filter for
`example.com` in the UI). This confirms the headless browser's traffic is captured.

---

## Part E — Validate inference

> Confirmed working (this environment): model `qwen/qwen3.8-27b` via `http://host.docker.internal:1234/v1`
> (host LM Link → desktop). The desktop is also reachable directly at `http://192.168.1.158:1234/v1`.

### E1. Confirm the inference server is up

From the host, check the OpenAI-compatible endpoint:

```bash
curl -s http://127.0.0.1:1234/v1/models        # LM Studio default port
curl -s http://<LAN-IP>:1234/v1/models        # or your LAN inference server
```

Expect a JSON list of models. If empty/refused, start LM Studio (Local Server enabled) or your
LAN server first.

### E2. Confirm reachability from inside the container

```bash
docker run --rm --entrypoint bash pi-glider:latest \
  -c 'curl -s -o /dev/null -w "%{http_code}\n" http://host.docker.internal:1234/v1/models'
```

Expect `200`. (For a LAN server, curl the LAN IP directly — the bridge network reaches LAN hosts.)

### E3. Non-interactive inference test

```bash
docker run --rm -v ~/engagements/acme/.pi:/engagement/.pi --entrypoint bash pi-glider:latest -c \
  'pi -p "Reply with exactly: OK" --model lmstudio/qwen/qwen3.8-27b --no-session'
```

Substitute the model id with one from `pi --list-models` (the `--model` value is `provider/model-id`).
Expect the model to reply (e.g. `OK`). This proves end-to-end inference through the container.

### E4. Interactive test (optional)

```bash
./scripts/pi-glider ~/engagements/acme
```

Attach to the TUI, select the model, and send a prompt. Confirm a response.

---

## Part F — Full launch

### F1. Launch via the CLI

```bash
./scripts/pi-glider ~/engagements/acme
```

The CLI seeds `<engagement>/.pi/` (if needed), starts the in-container Caido proxy + UI, and mounts
the engagement dir → `/engagement` (the agentDir lives at `/engagement/.pi`).

### F2. Verify mounts + sessions

From inside a session (or a shell):

```bash
docker run --rm --entrypoint bash pi-glider:latest -c 'ls -la /engagement /engagement/.pi'
```

Expect `/engagement` to contain `RoE.md` (plus `recon/`, `evidence/`, `notes/`) and
`/engagement/.pi` to contain your config + skills. After a session, confirm Pi session files land
in `~/engagements/<name>/.pi/sessions/`.

---

## Part G — Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `pi --list-models` empty | wrong `baseUrl`/`apiKey` in `models.json` | fix `baseUrl`; keyless servers need a dummy `apiKey` |
| inference `pi -p` hangs | server not reachable from container | verify E2; use `host.docker.internal` (host) or LAN IP |
| Caido UI not reachable at `localhost:5000` | Caido not ready / wrong port | check `/var/log/caido.log` in the container; verify `CAIDO_UI_PORT` |
| proxy returns 200 but nothing in Caido | project not selected | confirm `caido-init: project "engagement" selected`; re-run `node /usr/local/bin/caido-init.js` |
| HTTPS proxying fails with cert error | CA not trusted in-container | confirm `SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE` → `/etc/ssl/certs/ca-certificates.crt` |
| tools `MISSING` | image rebuilt before tool list change | rebuild (B1) |
