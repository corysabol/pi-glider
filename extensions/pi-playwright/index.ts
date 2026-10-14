/**
 * pi-playwright — surface Playwright/Chromium to the agent as callable browser tools.
 *
 * A persistent, session-scoped Chromium page (proxied through Caido via `$CAIDO_CHROMIUM_ARGS`)
 * backs a small set of tools:
 *   - `browser_navigate`  load a URL, return title/status/body/trail
 *   - `browser_evaluate`  run arbitrary JS in the page (the interaction escape hatch)
 *   - `browser_screenshot` save a screenshot
 *   - `browser_close`     tear down the browser
 *
 * Multi-step flows (login → click → read) are done with `browser_evaluate` (an async JS snippet)
 * against the persistent page. Truly complex scenarios are still best done by writing a Node
 * script — see `tooling` (the model can `require('playwright')` via `NODE_PATH`).
 *
 * Playwright is loaded lazily (`await import("playwright")`) so extension startup stays cheap.
 * The single shared page is serialized with a mutex so parallel tool calls can't race it.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";

const EVIDENCE_DIR = "/engagement/evidence";
const MAX_TEXT_CHARS = 8000;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const SIDE_EFFECT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

// ── persistent browser state ───────────────────────────────────────────────
let browser: any = null;
let pagePromise: Promise<any> | null = null;

function launchArgs(): string[] {
  const args = (process.env.CAIDO_CHROMIUM_ARGS || "").split(" ").filter(Boolean);
  if (!args.some((a) => a.startsWith("--proxy-server"))) {
    args.push("--proxy-server=http://127.0.0.1:8080");
  }
  return args;
}

async function getPage(): Promise<any> {
  if (!pagePromise) {
    pagePromise = (async () => {
      const pw: any = await import("playwright");
      browser = await pw.chromium.launch({ args: launchArgs(), ignoreHTTPSErrors: true });
      return await browser.newPage();
    })();
  }
  return pagePromise;
}

// Serialize access to the single shared page (Pi may dispatch tool calls in parallel).
let lock: Promise<void> = Promise.resolve();
function withPage<T>(fn: (page: any) => Promise<T>): Promise<T> {
  const run = lock.then(async () => fn(await getPage()));
  lock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function trim(text: string, max = MAX_TEXT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

function serialize(v: any): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function (pi: ExtensionAPI): void {
  // Close the browser when the session ends (idempotent).
  pi.on("session_shutdown", async () => {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
      pagePromise = null;
      lock = Promise.resolve();
    }
  });

  // ── browser_navigate ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "browser_navigate",
    label: "Browser Navigate",
    description:
      "Load a URL in the session's headless Chromium (routed through the Caido proxy) and return what a real browser sees: final URL, rendered title, HTTP status, body text, and the request/response trail. Use to open a page (SPAs, auth pages) that curl cannot model. The page persists across calls — follow up with browser_evaluate to click/fill, or browser_screenshot.",
    annotations: READ_ONLY,
    parameters: Type.Object({
      url: Type.String({ description: "Full URL to load (https://…)." }),
      wait_for: Type.Optional(
        Type.String({ description: "CSS selector to wait for after load (e.g. 'button#login') before extracting content." }),
      ),
    }),
    async execute(_toolCallId, params) {
      return withPage(async (page) => {
        const trail: { status: number | null; url: string }[] = [];
        const onResp = (r: any) => trail.push({ status: r.status(), url: r.url() });
        page.on("response", onResp);

        let status: number | null = null;
        try {
          const resp = await page.goto(String(params.url), { waitUntil: "domcontentloaded", timeout: 30000 });
          status = resp ? resp.status() : null;
        } catch {
          status = null;
        }
        if (params.wait_for) {
          try {
            await page.waitForSelector(String(params.wait_for), { timeout: 10000 });
          } catch {
            /* never appeared — report what is there */
          }
        } else {
          await page.waitForTimeout(1500).catch(() => {});
        }
        page.off("response", onResp);

        const title = (await page.title().catch(() => "")) || "";
        const finalUrl = page.url();
        let text = "";
        try {
          text = ((await page.evaluate(() => (document.body ? document.body.innerText : ""))) || "").slice(0, MAX_TEXT_CHARS);
        } catch {
          text = "";
        }
        const trailSummary = trail
          .slice(0, 40)
          .map((t) => `${String(t.status ?? "?")} ${t.url}`)
          .join("\n");

        const out: string[] = [];
        out.push(`Title: ${title || "(none)"}`);
        out.push(`URL: ${finalUrl}`);
        if (status != null) out.push(`Status: ${status}`);
        if (trail.length) out.push(`Requests (${trail.length}):\n${trailSummary}${trail.length > 40 ? `\n… (+${trail.length - 40} more)` : ""}`);
        out.push(`Body text:\n${text || "(empty)"}`);

        return {
          content: [{ type: "text", text: out.join("\n\n") }],
          details: { url: params.url, finalUrl, title, status, requestCount: trail.length, trail },
        };
      });
    },
  });

  // ── browser_evaluate ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "browser_evaluate",
    label: "Browser Evaluate",
    description:
      "Run an async JavaScript snippet in the current page and return its result. Use for interactions and extraction against the persistent page — e.g. click a button, fill a form, then return text. Multi-statement scripts should end with `return <value>`; the returned value is serialized (objects → JSON). For flows too complex for one snippet, write a Node script instead (see tooling).",
    annotations: SIDE_EFFECT,
    parameters: Type.Object({
      js: Type.String({ description: "Async JS to run in the page. Use `return X` to return a value, e.g. `document.querySelector('#submit').click(); await new Promise(r=>setTimeout(r,1500)); return document.body.innerText;`." }),
    }),
    async execute(_toolCallId, params) {
      return withPage(async (page) => {
        if (page.url() === "about:blank") {
          return {
            content: [{ type: "text", text: "No page loaded yet — call browser_navigate first." }],
            details: { url: "about:blank" },
          };
        }
        const result = await page.evaluate(`(async () => {\n${params.js}\n})()`);
        const { text, truncated } = trim(serialize(result));
        return {
          content: [{ type: "text", text: (truncated ? `[result truncated to ${MAX_TEXT_CHARS} chars]\n` : "") + text }],
          details: { url: page.url(), result: serialize(result).slice(0, 10000) },
        };
      });
    },
  });

  // ── browser_screenshot ───────────────────────────────────────────────────
  pi.registerTool({
    name: "browser_screenshot",
    label: "Browser Screenshot",
    description:
      "Save a screenshot of the current page to /engagement/evidence/ (or a custom path). Use to capture visual evidence of a finding or rendered state.",
    annotations: READ_ONLY,
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Output path (default /engagement/evidence/<host>-<ts>.png)." })),
    }),
    async execute(_toolCallId, params) {
      return withPage(async (page) => {
        if (page.url() === "about:blank") {
          return {
            content: [{ type: "text", text: "No page loaded yet — call browser_navigate first." }],
            details: { url: "about:blank" },
          };
        }
        let shotPath = typeof params.path === "string" && params.path ? params.path : "";
        if (!shotPath) {
          const host = (page.url() ? new URL(page.url()).hostname : "target").replace(/[^a-zA-Z0-9.-]/g, "_");
          fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
          shotPath = path.join(EVIDENCE_DIR, `${host}-${Date.now()}.png`);
        } else {
          fs.mkdirSync(path.dirname(path.resolve(shotPath)), { recursive: true });
        }
        await page.screenshot({ path: shotPath, fullPage: false });
        return {
          content: [{ type: "text", text: `Screenshot saved: ${shotPath}` }],
          details: { url: page.url(), path: shotPath },
        };
      });
    },
  });

  // ── browser_close ────────────────────────────────────────────────────────
  pi.registerTool({
    name: "browser_close",
    label: "Browser Close",
    description:
      "Close the session's browser and free Playwright. Use when you are done with browser work. The browser is also closed automatically when the session ends.",
    annotations: SIDE_EFFECT,
    parameters: Type.Object({}),
    async execute() {
      return withPage(async () => {
        if (browser) {
          await browser.close().catch(() => {});
          browser = null;
          pagePromise = null;
        }
        return { content: [{ type: "text", text: "Browser closed." }], details: { closed: true } };
      });
    },
  });
}
