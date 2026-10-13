These are reminders to myself of things that need to be tackled in the project.

## Ensure that sessions are not stored in ~/.config/pi-glider/agent/sessions
This is problematic, because this directory is used to configure pi in the sandbox kali container.
But it is reused between working sessions, as such this could leak data between engagements that the
agent technically could read. We need to make sure sessions are stored in the mounted engagement dir only.
This is likely some config for pi we can tweak.

## We need to think about a good way to fascilitate per-engagement config / improvements
Operators may want to tweak any of the skills, templates, methodology docs, configs etc per-engagement
and even persist those changes. We should figure out a good way to facilitate this, currently changes to
the files either in ~/.config/pi-glider, or ~/.pi/ inside a working container will change the config for
all sessions going forward.

## An idea to further keep the agent on rails and on task
To avoid further rabbit holing, the system prompt is appended, and upon startup and compaction
methodology tips + the main pi-glider skill is reinjected.

However, it might be interesting to also consider doing some kind of tool call hook such that when
the agent is about to or does execute a tool like executing commands, the guiding principles are also
re-injected into this. To triple check keeping the agent focused and directed.

## Make the agent write findings / interesting notes to markdown as it works
The agent should be writing anything interesting, relevant, or potential / concrete findngs to files as it works.
This is super important to make sure details do not get lost to the compaction ether.
This is all about trying to build on a level determinsism and reliability to a fuzzy pattern matching / generating system.

## Reporting skill should use the full contents of the findings
Findings are written to intermediate files which have several important sections.
Reporting should use that content directly when creating the final report document.
Also, it would probably be good to create some separate adapter script that pushes findings
directly to plextrac.

## Generalize APPEND_SYSTEM.md (deferred follow-up #1)
The current `config/APPEND_SYSTEM.md` is pi-glider-specific: it references the Kali container,
`/engagement/RoE.md`, and `/engagement/evidence/`. Generalize it so it is universal and can be
reused outside the pentest container:
- Remove the Kali-container / `RoE.md` / `/engagement/evidence/` specifics.
- Add a way to swap host-vs-container wording (e.g. a small set of variant blocks or a
  per-engagement override) so the same prompt works in container mode and `--no-container` mode.
Keep it minimal and razor-sharp (it is injected every turn).

## Proper packaging / installer (deferred follow-up #3)
`scripts/pi-glider self-install` currently symlinks the CLI into `~/.local/bin`. Replace this with
a real package/installer (e.g. Homebrew tap, npm package, or a single-file installer) so users can
install pi-glider without cloning the repo. Decide the distribution story and document it in the
README.

## Build version pinning (deferred follow-up #4)
Pi, Node, and Playwright currently install at "latest" at image build time, which keeps the image
current but makes builds non-reproducible:
- **Node** is resolved at build time from https://nodejs.org/dist/index.json (newest release).
- **Pi** (`@earendil-works/pi-coding-agent`) installs `latest`.
- **Playwright** (`playwright@latest`) installs `latest`.

Plan: parameterize each with a build `ARG` defaulting to `latest`, and pin Node+Pi+Playwright as a
*single* compatibility surface (they version-bump together — e.g. Pi 0.75+ required Node >= 22.19.0,
and Playwright needs a matching Node). Enable test builds with
`docker build --build-arg PLAYWRIGHT_VERSION=1.x.y -t pi-glider:X.Y.Z container/`.

Caveats to handle while pinning:
- **Playwright ↔ Node coupling** — the CLI and the downloaded Chromium build must stay matched; a
  version bump re-downloads the ~450MB browser, so keep the two Playwright `RUN` lines (npm install
  + `npx playwright install chromium`) adjacent/atomic so a pin applies to both.
- **CA is persisted per-engagement** — the MITM CA is generated on first run under
  `<engagement>/.caido/certs/` (not baked at build), so version pinning/rebuilds don't invalidate it
  or any operator-imported copy of the root.

## MCP migration to native Pi MCP (done: removed pi-mcp-extension + Burp)
- Pi agent v1.0+ ships **native MCP** (built-in `/mcp` command), which collides with the old
  `pi-mcp-extension` slash command.
- Removed `pi-mcp-extension` (`pi install` in Dockerfile, `config/settings.json` `packages`,
  `config/mcp.json` settings/toolPrefix) and the **Burp MCP** server + host-side bridge
  (`scripts/burp-mcp-bridge.py`, `skills/mcp/mcp-burp/`).
- Future MCP integrations should use Pi's built-in `/mcp`; the native config schema is TBD (don't
  guess it). The in-container **Caido** proxy remains the capture point for web traffic.

## Agent integration — in progress (see docs/agent-integration-plan.md)
- **Done:** skills index + routing (Thread 1); `extensions/pi-caido` P0 read-only tools
  (Thread 2 — list/get request, get response, list/view sitemap; GraphQL validated vs Caido 0.56).
- **Remaining: Caido P1–P4** — `caido_send_request`/`caido_send_raw_request` (replay),
  `caido_create_finding`/`caido_list_findings`, scope management (`caido_list_scopes`/
  `caido_add_scope`), richer query/export. Add `readOnlyHint`/`destructiveHint` annotations to the
  tools (already read-only; needs destructive ones surfaced for replay/send).
- **Remaining: Playwright surfacing (Thread 3)** — a `browser` tool in `extensions/pi-playwright`
  so the model does dynamic testing via a callable tool instead of hand-writing Node scripts.

## Caido project persistence (documented; credentials deferred)
- Caido data lives under `<engagement>/.caido/` (persists); the MITM CA is generated on first run
  under `.caido/certs/` (persists).
- **Caveat:** Caido does not save projects in guest mode — the auto-bootstrapped project is
  temporary/disposable. To persist+resume, the operator logs in with a Caido account (free = 2
  projects; Pro lifts limits) via the UI instead of "Continue as guest". Documented in README.
- **Future phase:** optionally support seeded credentials (Caido account token / PAT) so the
  in-container tooling can authenticate programmatically without the operator logging in manually.
