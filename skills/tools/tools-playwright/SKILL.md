---
name: tools-playwright
description: |-
  Playwright (Chromium) for dynamic in-browser testing. Launch patterns, Caido proxy
  integration, and evidence capture (screenshots, DOM dumps, request logs).
---

# Playwright

Playwright + Chromium is installed globally (`playwright` on PATH, browsers in
`/ms-playwright`, `require('playwright')` works via `NODE_PATH`). Use it for dynamic
browser testing: SPA crawling, auth flows, XSS/CSRF confirmation, post-login surface
mapping — anything curl can't model.

## Callable tool (preferred)

The `pi-playwright` extension registers a `browser_navigate` tool — use it for simple fetch-a-page
needs instead of hand-writing a Node script:

- `browser_navigate { url, wait_for?, extract_text?, screenshot? }` — loads a URL in headless
  Chromium (proxied through Caido), returns final URL, title, HTTP status, body text, and the
  request/response trail; optionally saves a screenshot to `/engagement/evidence/`.

Use the Node snippets below when you need multi-step interactions (login → click → read) that a
single navigation can't model.

## Launch rules (non-negotiable)

All browser traffic must go through Caido. Always use the container-provided env:

- `$CAIDO_CHROMIUM_ARGS` = `--proxy-server=http://127.0.0.1:8080 --ignore-certificate-errors --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage`
- Running as root ⇒ Chromium needs `--no-sandbox`.

Node snippet (save scratch scripts under `/engagement/scratch/`):

```js
// node scratch/probe.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: process.env.CAIDO_CHROMIUM_ARGS.split(' '),
    ignoreHTTPSErrors: true, // Caido MITMs TLS — don't mask real cert issues in notes
  });
  const page = await browser.newPage();

  // Mirror every request to Caido *and* keep a local evidence trail
  page.on('response', (r) => console.log(`${r.status()} ${r.url()}`));

  await page.goto('https://target.example/');
  await page.screenshot({ path: 'evidence/target-home.png', fullPage: true });
  // ... interactions ...
  await browser.close();
})();
```

Python-style one-liners work too: `playwright screenshot --help`, `playwright open` —
but the CLI won't carry the proxy args; prefer Node with `CAIDO_CHROMIUM_ARGS`.

## Gotchas

- **Loopback targets bypass the proxy by default.** For an app served on localhost, add
  `--proxy-bypass-list=\<-loopback\>` so those requests also land in Caido. Prefer
  `http://host.docker.internal:PORT` for host-served apps (proxied normally).
- **Headless user-agent** contains `HeadlessChrome` — fingerprint-sensitive targets may
  serve a different app. Override `userAgent` in the context when needed.
- Use contexts (`browser.newContext()`) to isolate per-user/per-role sessions; save
  `storageState` to `/engagement/scratch/state-<role>.json` to reuse auth sessions.
- Long waits: `page.waitForLoadState('networkidle')` can hang on chatty SPAs; prefer
  waiting on a specific selector.

## Evidence

- Screenshots → `/engagement/evidence/` (`fullPage: true` for findings).
- For request-level proof, cite the Caido entry (the operator can export it) plus a
  reproduction Node snippet, not raw HAR dumps.
