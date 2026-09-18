/**
 * pi-glider-compaction — re-inject the pi-glider operating manual after compaction.
 *
 * Auto-compaction summarizes and discards old messages, which drops the skill body the model read
 * earlier in the session. The system prompt (APPEND_SYSTEM.md) keeps a minimal pointer, but this
 * extension deterministically re-injects the full operating manual as a hidden user message after
 * every compaction so the methodology is fresh again (and survives the model regressing to latent
 * behavior when context is exhausted).
 */

import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? "/root/.pi/agent";
const SKILL_PATH = `${AGENT_DIR}/skills/core/pi-glider/SKILL.md`;

export default function (pi: ExtensionAPI): void {
  pi.on("session_compact", (_event, ctx) => {
    let skill: string;
    try {
      skill = fs.readFileSync(SKILL_PATH, "utf-8");
    } catch {
      return; // skill missing — nothing to re-inject
    }

    pi.sendMessage(
      {
        customType: "pi-glider-reinject",
        content: `Context was compacted. Re-loaded pi-glider operating manual (follow it):\n\n${skill}`,
        display: false, // hidden from the transcript; still part of LLM context
      },
      { deliverAs: "steer" },
    );

    ctx.ui.notify("Re-injected pi-glider operating manual after compaction", "info");
  });
}
