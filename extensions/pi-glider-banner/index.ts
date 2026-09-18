/**
 * pi-glider-banner — custom startup header for the pi-glider agent.
 *
 * Replaces Pi's built-in "pi vX.Y.Z" header with a Conway's Game of Life
 * "glider" (the old-school hacker symbol the project is named after) rendered
 * in Unicode blocks, beside a block-letter "PI-GLIDER" wordmark and the
 * version.
 *
 * The glider animates in place for a short time at startup — it cycles through
 * its four Game-of-Life phases (so the shape subtly morphs) and then freezes on
 * the canonical glider. Startup output is held until the animation finishes so
 * the per-frame re-renders don't hijack the terminal scroll. Set ANIMATE = false
 * to render it fully static.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";

// ─── Glyphs & sizing ─────────────────────────────────────────────────────────

const ALIVE = "█";
const DEAD = "░"; // light shade — subtle background block for dead cells

// Terminal cells are ~2:1 (taller than wide), so use twice as many horizontal
// characters as vertical to make each cell render as a square rather than a
// column. CELL_W = 2 × CELL_H.
const CELL_W = 4; // horizontal characters per cell
const CELL_H = 2; // vertical characters per cell

// The glider's four Game-of-Life phases (B3/S23). Cycling through them makes
// the shape morph in place; after four phases it returns to the canonical
// glider.
const GLIDER_PHASES = [
  ["░█░", "░░█", "███"],
  ["█░█", "░██", "░█░"],
  ["░░█", "█░█", "░██"],
  ["█░░", "░██", "██░"],
];

/** Scale a cell pattern up so each cell is a uniform CELL_W×CELL_H block. */
function scalePattern(pattern: string[], cellW: number, cellH: number): string[] {
  const lines: string[] = [];
  for (const row of pattern) {
    const scaledRow = row
      .split("")
      .map((c) => c.repeat(cellW))
      .join("");
    for (let i = 0; i < cellH; i++) lines.push(scaledRow);
  }
  return lines;
}

// ─── Block-letter wordmark ───────────────────────────────────────────────────

// 5×5 block font for the "PI-GLIDER" wordmark. Spaces are transparent.
const FONT: Record<string, string[]> = {
  P: ["█████", "█   █", "█████", "█    ", "█    "],
  I: ["█████", "  █  ", "  █  ", "  █  ", "█████"],
  "-": ["     ", "     ", " ███ ", "     ", "     "],
  G: ["█████", "█    ", "█ ███", "█   █", "█████"],
  L: ["█    ", "█    ", "█    ", "█    ", "█████"],
  D: ["████ ", "█   █", "█   █", "█   █", "████ "],
  E: ["█████", "█    ", "████ ", "█    ", "█████"],
  R: ["████ ", "█   █", "████ ", "█ █  ", "█  █ "],
};

const BLANK = ["     ", "     ", "     ", "     ", "     "];

/** Render a wordmark string to 5 rows of block-letter text. */
function renderText(text: string): string[] {
  const rows = ["", "", "", "", ""];
  for (const ch of text) {
    const glyph = FONT[ch] ?? BLANK;
    for (let r = 0; r < 5; r++) rows[r] += glyph[r] + " ";
  }
  return rows.map((r) => r.trimEnd());
}

// ─── Static header ───────────────────────────────────────────────────────────

function renderStatic(theme: Theme, pattern: string[]): string[] {
  const glider = scalePattern(pattern, CELL_W, CELL_H).map((row) =>
    row
      .split("")
      .map((c) => (c === ALIVE ? theme.fg("accent", ALIVE) : theme.fg("muted", DEAD)))
      .join(""),
  );

  const text = renderText("PI-GLIDER").map((row) => theme.fg("accent", row));
  const version = theme.fg("dim", `v${VERSION}`);

  // Glider is 6 rows tall; the wordmark (5 rows) + version (1 row) = 6 rows.
  const lines: string[] = [];
  for (let i = 0; i < glider.length; i++) {
    const right = i < text.length ? text[i] : version;
    lines.push(`${glider[i]}  ${right}`);
  }
  return lines;
}

// ─── Startup animation ───────────────────────────────────────────────────────

// Animate the glider through its phases in place for a short time, then freeze.
const ANIMATE = true;
const ANIMATE_FRAMES = 8; // phase steps before freezing (multiple of 4 → ends on phase 0)
const TICK_MS = 150;

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return; // skip in print/RPC (non-interactive) modes

    ctx.ui.setHeader((tui, theme) => {
      if (ANIMATE) {
        let phase = 0;
        let frames = 0;
        const component = {
          render(_width: number): string[] {
            return renderStatic(theme, GLIDER_PHASES[phase]);
          },
          invalidate(): void {},
        };
        const timer = setInterval(() => {
          phase = (phase + 1) % GLIDER_PHASES.length;
          if (++frames >= ANIMATE_FRAMES) {
            clearInterval(timer);
            phase = 0; // freeze on the canonical glider
          }
          tui.requestRender();
        }, TICK_MS);
        (component as typeof component & { dispose?: () => void }).dispose = () =>
          clearInterval(timer);
        return component;
      }

      const lines = renderStatic(theme, GLIDER_PHASES[0]);
      return {
        render(_width: number): string[] {
          return lines;
        },
        invalidate(): void {},
      };
    });

    // Hold the rest of startup (skills/model/prompt body) until the animation
    // finishes. session_start handlers are awaited, and Pi renders the body only
    // after they return, so awaiting here delays the body. The per-frame
    // re-renders would otherwise snap the terminal scroll to the header; by
    // delaying the body until the glider freezes, there's nothing to scroll yet.
    if (ANIMATE) {
      await new Promise((resolve) =>
        setTimeout(resolve, ANIMATE_FRAMES * TICK_MS + TICK_MS),
      );
    }
  });
}
