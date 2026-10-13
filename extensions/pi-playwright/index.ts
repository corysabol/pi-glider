/**
 * pi-playwright — surface Playwright/Chromium to the agent as a callable browser tool.
 *
 * The agent previously had Playwright "reachable but not surfaced": it could hand-write
 * `node require('playwright')` scripts, so it rarely bothered. This extension exposes a
 * `browser_navigate` tool that launches Chromium (proxied through Caido via
 * `$CAIDO_CHROMIUM_ARGS`), loads a page as a real browser would, and reports the rendered
 * result — which curl cannot model (SPAs, JS-rendered content, redirects, auth flows).
 *
 * Playwright is loaded lazily (`await import("playwright")`) so extension startup stays cheap
 * and the library only resolves on first use. Chromium lives in `/ms-playwright`
 * (`PLAYWRIGHT_BROWSERS_PATH`); `NODE_PATH` makes `playwright` resolvable.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";

const EVIDENCE_DIR = "/engagement/evidence";
const MAX_TEXT_CHARS = 8000;

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "browser_navigate",
    label: "Browser Navigate",
    description:
      "Load a URL in headless Chromium (routed through the Caido proxy) and return what a real browser sees: final URL, rendered page title, HTTP status, text content, and the request/response trail. Use for dynamic web testing — JS-rendered SPAs, auth flows, post-login surface, redirects — where curl cannot model the page. Optionally save a screenshot to /engagement/evidence/.",
    parameters: Type.Object({
      url: Type.String({ description: "Full URL to load (https://…)." }),
      wait_for: Type.Optional(
        Type.String({ description: "CSS selector to wait for after load (e.g. 'button#login') before extracting content." }),
      ),
      extract_text: Type.Optional(
        Type.Boolean({ description: "Return the rendered body text (default true, truncated at 8KB)." }),
      ),
      screenshot: Type.Optional(
        Type.Boolean({ description: "Save a viewport screenshot to /engagement/evidence/ (default false)." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const pw = await import("playwright");
      const args = (process.env.CAIDO_CHROMIUM_ARGS || "").split(" ").filter(Boolean);
      if (!args.some((a) => a.startsWith("--proxy-server"))) {
        args.push("--proxy-server=http://127.0.0.1:8080");
      }
      const browser = await pw.chromium.launch({ args, ignoreHTTPSErrors: true });
      try {
        const page = await browser.newPage();
        const trail: { status: number | null; url: string; type: string }[] = [];
        page.on("response", (r) => {
          trail.push({ status: r.status(), url: r.url(), type: r.request().resourceType() });
        });

        let status: number | null = null;
        try {
          const resp = await page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 30000 });
          status = resp ? resp.status() : null;
        } catch (e: any) {
          // goto can reject on redirects/aborts even when the page rendered; fall through.
          status = null;
        }

        if (params.wait_for) {
          try {
            await page.waitForSelector(String(params.wait_for), { timeout: 10000 });
          } catch {
            /* selector never appeared — report what is there */
          }
        } else {
          // Let JS-rendered SPAs settle briefly.
          await page.waitForTimeout(1500).catch(() => {});
        }

        const title = (await page.title().catch(() => "")) || "";
        const finalUrl = page.url();
        let text = "";
        const wantText = params.extract_text !== false;
        if (wantText) {
          try {
            text = ((await page.evaluate(() => (document.body ? document.body.innerText : ""))) || "").slice(
              0,
              MAX_TEXT_CHARS,
            );
          } catch {
            text = "";
          }
        }

        let shotPath = "";
        if (params.screenshot) {
          try {
            fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
            const slug = (new URL(finalUrl).hostname || "target").replace(/[^a-zA-Z0-9.-]/g, "_");
            shotPath = path.join(EVIDENCE_DIR, `${slug}-${Date.now()}.png`);
            await page.screenshot({ path: shotPath, fullPage: false });
          } catch {
            shotPath = "";
          }
        }

        const trailSummary = trail
          .slice(0, 40)
          .map((t) => `${String(t.status ?? "?")} ${t.url}`)
          .join("\n");
        const out: string[] = [];
        out.push(`Title: ${title || "(none)"}`);
        out.push(`Final URL: ${finalUrl}`);
        if (status != null) out.push(`Status: ${status}`);
        if (trail.length) out.push(`Requests (${trail.length}):\n${trailSummary}${trail.length > 40 ? `\n… (+${trail.length - 40} more)` : ""}`);
        if (wantText) out.push(`Body text:\n${text || "(empty)"}`);
        if (shotPath) out.push(`Screenshot: ${shotPath}`);

        return {
          content: [{ type: "text", text: out.join("\n\n") }],
          details: { url: params.url, finalUrl, title, status, requestCount: trail.length, screenshot: shotPath },
        };
      } finally {
        await browser.close().catch(() => {});
      }
    },
  });
}
