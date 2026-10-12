/**
 * pi-ctx-injector — keep configured reference material (skills, tips, methodology) in context.
 *
 * Two things drop the reference material the model read earlier:
 *   1. A fresh session starts with only the APPEND_SYSTEM.md pointer in context.
 *   2. Auto-compaction summarizes and discards old messages (lossy by definition).
 *
 * Reads `context-inject.json` from the agentDir and injects the configured files as hidden user
 * messages — `onStart` once at session start, `onCompact` after every compaction — so the material
 * stays fresh (and survives the model regressing to latent behavior when context is exhausted).
 * Paths are relative to the agentDir.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? "/engagement/.pi";
const CONFIG_PATH = path.join(AGENT_DIR, "context-inject.json");

interface InjectConfig {
  onStart?: string[];
  onCompact?: string[];
}

function readConfig(): InjectConfig | undefined {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as InjectConfig;
  } catch {
    return undefined; // no config — nothing to inject
  }
}

function readFiles(relPaths: string[] | undefined): string[] {
  if (!relPaths) return [];
  const out: string[] = [];
  for (const rel of relPaths) {
    try {
      out.push(fs.readFileSync(path.resolve(AGENT_DIR, rel), "utf-8"));
    } catch {
      // missing file — skip
    }
  }
  return out;
}

function inject(pi: ExtensionAPI, customType: string, header: string, contents: string[]): void {
  if (contents.length === 0) return;
  pi.sendMessage(
    { customType, content: `${header}\n\n${contents.join("\n\n")}`, display: false },
    { deliverAs: "steer" },
  );
}

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", () => {
    const config = readConfig();
    if (!config) return;
    inject(pi, "ctx-inject-start", "Reference material (follow this):", readFiles(config.onStart));
  });

  pi.on("session_compact", (_event, ctx) => {
    const config = readConfig();
    if (!config) return;
    const contents = readFiles(config.onCompact);
    if (contents.length === 0) {
      ctx.ui.setStatus("ctx-inject", "ctx-injector: no configured files found — not re-injected");
      return;
    }
    inject(
      pi,
      "ctx-inject-compact",
      "Context was compacted. Re-loaded reference material (follow this):",
      contents,
    );
    // setStatus writes to the footer status bar, which survives compaction_end's transcript
    // rebuild. (notify would render a dim line in the transcript that compaction_end wipes.)
    ctx.ui.setStatus("ctx-inject", "ctx-injector: re-injected reference material after compaction");
  });
}
