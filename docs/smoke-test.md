# Smoke test

Verification steps for the pi-glider container. Run these after any change to `container/`.

## 1. Build

```bash
docker build -t pi-glider:latest container/
```

## 2. Verify image contents

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

Expected: node v22.x, pi 0.x, all 14 tools `OK`, and `pi-mcp-extension` present.

## 3. Verify config + extension registration

```bash
docker run --rm \
  -v ~/.config/pi-glider:/root/.pi/agent \
  --entrypoint bash pi-glider:latest -c '
    pi --list-models    # expect the configured providers/models
    pi list             # expect npm:pi-mcp-extension → /usr/local/lib/node_modules
  '
```

## 4. Operator-side checks (require host services)

- **Model inference:** with LM Studio (or the LAN server) running, confirm `pi --list-models`
  shows the model and a session completes a request.
- **Burp MCP:** with Burp's MCP server listening on the host, attach to a session and run
  `/mcp` (pi-mcp-extension) — expect `burp` connected; `/mcp burp` for detail.

## Notes / known limitations

- `pi-mcp-extension` is baked into the image at build time (global npm) and registered via
  `config/settings.json`. It is **not** installed at runtime.
- Extensions installed by an operator *inside* a running container (`pi install ...`) go to the
  container's global npm and are lost on teardown. To persist a new extension, add it to the
  Dockerfile and rebuild, or install it into the agentDir.
