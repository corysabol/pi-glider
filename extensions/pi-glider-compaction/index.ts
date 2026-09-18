/**
 * pi-glider-compaction — keep the pi-glider methodology + tips in context.
 *
 * Two things drop the methodology the model read earlier:
 *   1. A fresh session starts with only the APPEND_SYSTEM.md pointer in context (no skill body).
 *   2. Auto-compaction summarizes and discards old messages.
 *
 * This extension deterministically injects the operator-editable methodology tips at session start,
 * and re-injects both the full operating manual (SKILL.md) and the tips after every compaction, as
 * hidden user messages so the methodology stays fresh (and survives the model regressing to latent
 * behavior when context is exhausted).
 */

import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? "/root/.pi/agent";
const SKILL_PATH = `${AGENT_DIR}/skills/core/pi-glider/SKILL.md`;
const TIPS_PATH = `${AGENT_DIR}/methodology-tips.md`;

function readOptional(path: string): string | undefined {
  try {
    return fs.readFileSync(path, "utf-8");
  } catch {
    return undefined; // file missing — nothing to inject
  }
}

export default function (pi: ExtensionAPI): void {
  // Inject the operator-editable tips once at session start, so they're in context from the
  // first turn (not just after the first compaction).
  pi.on("session_start", () => {
    const tips = readOptional(TIPS_PATH);
    if (!tips) return;

    pi.sendMessage(
      {
        customType: "pi-glider-tips",
        content: `General methodology tips (follow these):\n\n${tips}`,
        display: false, // hidden from the transcript; still part of LLM context
      },
      { deliverAs: "steer" },
    );
  });

  pi.on("session_compact", (_event, ctx) => {
    const skill = readOptional(SKILL_PATH);
    const tips = readOptional(TIPS_PATH);
    if (!skill && !tips) {
      ctx.ui.setStatus("pi-glider-reinject", "pi-glider: operating manual + tips missing — not re-injected");
      return;
    }

    const parts: string[] = [];
    if (skill) parts.push(`Re-loaded pi-glider operating manual (follow it):\n\n${skill}`);
    if (tips) parts.push(`General methodology tips (follow these):\n\n${tips}`);

    pi.sendMessage(
      {
        customType: "pi-glider-reinject",
        content: `Context was compacted.\n\n${parts.join("\n\n")}`,
        display: false,
      },
      { deliverAs: "steer" },
    );

    // setStatus writes to the footer status bar, which survives compaction_end's transcript
    // rebuild. (notify would render a dim line in the transcript that compaction_end wipes.)
    ctx.ui.setStatus("pi-glider-reinject", "pi-glider: re-injected operating manual + tips after compaction");
  });
}
