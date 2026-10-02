# Browser automation plan (Playwright)

Status: **proposal — not implemented.** This is the plan for driving a real web browser from
pi-glider, analogous to how the mobile flow drives an AVD via `adb`.

## 1. The analogy

| Mobile (already built) | Web (this plan) |
|------------------------|-----------------|
| AVD emulator = the persistent, visible "device" | Browser = the persistent, visible "device" |
| `adb` = the control channel | Playwright (CDP) = the control channel |
| Operator sees the emulator window / `scrcpy` | Operator sees the browser window / VNC |
| Model drives via `adb shell` + `logcat` | Model drives via Playwright MCP tools |
| Burp MCP sees device traffic (proxied) | Burp MCP sees browser traffic (proxied) |

The goal is the same three capabilities the mobile flow already has:

1. **The operator can see** what the browser is doing.
2. **The operator can test through** the same browser (manual interaction).
3. **The model can view** the current page state and drive it.

## 2. The mechanism: Playwright MCP

We use the official **Playwright MCP server** (`@playwright/mcp`), exposed to Pi through the
existing `pi-mcp-extension` (same channel as Burp). Key properties (verified against current docs):

- **Accessibility snapshots by default** — the model "sees" the page as a structured text tree
  (roles, names, `ref`s), not pixels. No vision model required, which matches the current
  text-only models (`qwen3.8-27b`). Deterministic and cheap.
- **Headed by default** — the browser is visible, so the operator can watch/take over.
- **Persistent profile** — `--user-data-dir` persists cookies/localStorage across sessions (login
  state survives). `--isolated` + `--storage-state` is the ephemeral alternative.
- **Capability flags** — `--caps=network` (request listing/mocking), `--caps=storage` (cookies),
  `--caps=vision` (coordinate tools + screenshots for vision models), `--caps=pdf`, `--caps=devtools`.
- **Proxy** — `--proxy-server` / `--proxy-bypass` route the browser through Burp.
- **Scope guardrails** — `--allowed-origins` / `--blocked-origins` constrain what the browser may
  request (maps to RoE scope).
- **Attach to an existing browser** — `--cdp-endpoint` connects to a browser the operator already
  launched (the "operator-native" mode).
- **`browser_run_code_unsafe`** — runs arbitrary Playwright code in the server process
  (RCE-equivalent). Fine for a trusted pentest agent (it already runs arbitrary Kali commands),
  but worth knowing it exists.

## 3. Deployment modes

### Primary (recommended): Playwright MCP owns a persistent, headed browser

- `pi-mcp-extension` launches `@playwright/mcp` as a **stdio** child (same lifecycle as the Pi
  session), with `--user-data-dir` pointed into the engagement dir for persistence.
- **Container mode** — browser runs headed under **Xvfb**, exposed to the operator via
  **noVNC** (web viewer at `http://localhost:6080`). Browser is sandboxed in the container.
- **Host mode (`--no-container`)** — browser runs headed directly on the operator's desktop.
- Proxy through Burp so Burp MCP sees the same traffic.

### Alternative A: CDP attach (operator-native)

Operator launches Chrome/Chromium with `--remote-debugging-port=9222`; Playwright MCP connects via
`--cdp-endpoint`. The operator uses their *real* browser; the model drives the same tabs. Best when
the operator wants to drive manually and have the model observe/assist — but the browser is then on
the host (not sandboxed) and shares the operator's real profile, so it is opt-in only.

### Alternative B: standalone HTTP MCP server

Run `npx @playwright/mcp --port <n>` as a background service and point `pi-mcp-extension` at the
SSE/HTTP endpoint. Decouples the browser lifecycle from the Pi session (browser survives Pi
restarts), closer to the "persistent AVD" model. More moving parts; revisit if session restarts
become painful.

## 4. Burp synergy

The browser routes through Burp's **proxy listener** (`127.0.0.1:8080` by default — distinct from
Burp's **MCP listener** on `9876`). Result: the model gets two correlated views of the app —

- **Playwright MCP** → rendered UI (accessibility snapshot) + screenshots.
- **Burp MCP** → the raw HTTP requests/responses the browser actually sent.

This is the single biggest win for web-app testing: the model can map UI actions to the underlying
API surface (which directly addresses the earlier "client routes vs real API surface" gap).

## 5. Concrete changes

### `config/mcp.json`
Add a `playwright` server (stdio). Representative shape (verify exact field names against
`pi-mcp-extension` docs during implementation):

```jsonc
"playwright": {
  "transport": "stdio",
  "command": "npx",
  "args": [
    "@playwright/mcp@latest",
    "--browser", "chromium",
    "--user-data-dir", "/engagement/.browser-profile",   // container; host uses <engagement>/.browser-profile
    "--caps", "network,storage",
    "--proxy-server", "http://host.docker.internal:8080", // container; host uses 127.0.0.1:8080
    "--output-dir", "/engagement/evidence"                // screenshots/traces land in evidence
  ]
}
```

### `container/Dockerfile`
- Install Playwright + Chromium + system deps: `npx playwright install --with-deps chromium`
  (add `--no-sandbox` handling for root — Chromium's sandbox needs user namespaces).
- Install `xvfb`, a lightweight WM (`openbox` or `fluxbox`), `x11vnc`, and `novnc` for operator
  visibility.

### `container/docker-compose.yml`
- Expose the noVNC port (`6080`) and VNC port (`5900`) to the host.
- Mount `<engagement>/.browser-profile` (or keep it under `.pi/`) so the browser profile persists
  with the engagement.

### `scripts/pi-glider`
- Seed a `.browser-profile/` dir (or `.pi/browser-profile/`) alongside `.pi/`.
- In container mode, start Xvfb + VNC + noVNC before launching Pi (or bake into `entrypoint.sh`),
  and print the noVNC URL so the operator knows where to look.
- In `--no-container` mode, skip the display stack (browser shows on the desktop).

### Skills
- **`skills/core/pi-glider-webapp/SKILL.md`** (new) — operating manual for a browser-driven web-app
  assessment, mirroring `mastg-android`: recon the *rendered* app + its API surface, drive flows
  through the browser, correlate with Burp traffic, shallow confirmatory testing, breadth over
  depth. This is the web-app analogue of the MASTG manual.
- **`skills/tools/playwright/SKILL.md`** (new) — reference for the Playwright MCP tools
  (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`,
  `browser_take_screenshot`, `browser_network_requests`, `browser_console_messages`, etc.) and the
  accessibility-snapshot `ref` model.
- **`config/methodology-tips.md`** — add browser-driven heuristics (e.g. "drive the app through the
  browser and correlate with Burp to map the real API surface, not just client-side routes").

### Templates
- **`templates/webapp/WebApp-Kickoff.md`** (new) — kickoff message template for a browser-driven
  web-app assessment (target URL, auth/seed credentials, scope reminder, deliverable), mirroring
  `templates/mastg/MASTG-Android-Kickoff.md`.

### `config/context-inject.json`
- For web-app engagements, point `onCompact` at `skills/core/pi-glider-webapp/SKILL.md` (same
  pattern as the MASTG swap documented in the README).

### Docs
- `docs/architecture.md`, `docs/engagement-workflow.md`, `docs/smoke-test.md` — add the browser
  component, the noVNC/headed visibility story, and smoke-test steps (launch, snapshot, screenshot,
  Burp correlation).

## 6. Open decisions for the operator

1. **Primary vs CDP-attach.** Confirm we lead with "MCP-owned headed browser + noVNC" and keep
   CDP-attach as a documented opt-in. (Recommended: yes.)
2. **Vision.** Default to accessibility snapshots (text-only models). Add `--caps=vision` only if
   you start using a vision-capable model. (Recommended: snapshot-first.)
3. **Burp proxy by default.** Route the browser through Burp always, or make it opt-in? (Recommended:
   default on, since it's the main value-add; allow `--proxy-bypass` for out-of-scope noise.)
4. **Scope guardrails.** Use `--allowed-origins`/`--blocked-origins` to keep the browser in scope?
   (Recommended: seed from RoE scope, but keep it operator-editable, not enforced hard.)
5. **Profile persistence location.** `.browser-profile/` at the engagement root vs under `.pi/`.
   (Recommended: engagement root, gitignored, alongside `evidence/`.)
6. **Standalone server (Alternative B).** Defer unless session-restart persistence becomes a pain.

## 7. Phased implementation

1. **Container + config** — bake Playwright/Chromium + Xvfb/noVNC into the image; add the
   `playwright` MCP entry; expose ports. Smoke-test: browser launches headed under noVNC, model can
   `browser_navigate` + `browser_snapshot`.
2. **Visibility + persistence** — wire noVNC into the CLI/entrypoint, persist the profile, print the
   viewer URL. Smoke-test: operator watches/takes over; login state survives a session restart.
3. **Burp correlation** — proxy through Burp; confirm Burp MCP sees the browser's requests.
   Smoke-test: drive a login flow and see the requests in Burp history.
4. **Skills + methodology** — add `pi-glider-webapp`, `tools/playwright`, methodology tips, and the
   webapp kickoff template; wire `context-inject.json`.
5. **Docs** — update architecture/workflow/smoke-test; document the operator workflow and the
   noVNC/CDP options.

## 8. Risks / notes

- **Concurrency** — the model and operator share one browser; if both click at once they race. The
  workflow is: model drives during automated phases, operator takes over manually when needed (and
  the model re-reads state via `browser_snapshot`). Same interleaving as manual vs model `adb`.
- **Sandboxing** — browser in the container keeps it sandboxed; CDP-attach moves it to the host.
  Keep CDP-attach opt-in and documented as such.
- **Token cost** — snapshots add context per interaction; breadth-over-depth discipline (already
  encoded) keeps this bounded.
- **`browser_run_code_unsafe`** — powerful; rely on it for complex interactions but prefer the
  structured tools for the common cases so behavior stays reviewable.
