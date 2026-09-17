/**
 * pi-glider-banner — custom startup header for the pi-glider agent.
 *
 * Replaces Pi's built-in "pi vX.Y.Z" header with an animated Conway's Game of
 * Life "glider" (the old-school hacker symbol the project is named after).
 *
 * The glider evolves across a small grid for a short intro, then settles on a
 * static frame. The interval is cleared on dispose so nothing leaks on
 * session switch / exit.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";

// ─── Game of Life ────────────────────────────────────────────────────────────

const COLS = 28;
const ROWS = 7;
const ALIVE = "O";
const DEAD = ".";
const TICK_MS = 100;
const MAX_GENERATIONS = 30;

/** Build a fresh grid with the classic 3x3 glider placed at the top-left. */
function makeGrid(): number[][] {
  const g = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
  g[0][1] = 1;
  g[1][2] = 1;
  g[2][0] = 1;
  g[2][1] = 1;
  g[2][2] = 1;
  return g;
}

/** Advance one Conway's Game of Life generation (standard B3/S23 rules). */
function step(g: number[][]): number[][] {
  const next = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) n += g[rr][cc];
        }
      }
      next[r][c] = g[r][c] ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
    }
  }
  return next;
}

/** Render a grid to colored ASCII lines (alive = accent, dead = muted). */
function renderLines(g: number[][], theme: Theme): string[] {
  return g.map((row) =>
    row.map((cell) => (cell ? theme.fg("accent", ALIVE) : theme.fg("muted", DEAD))).join(""),
  );
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  // The UI context (with setHeader) is only available on event handlers, not on
  // the ExtensionAPI passed to the factory. Register on session_start, which
  // fires once the interactive TUI is up.
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return; // skip in print/RPC (non-interactive) modes

    ctx.ui.setHeader((tui, theme) => {
      let grid = makeGrid();
      let generation = 0;

      const component = {
        render(_width: number): string[] {
          return renderLines(grid, theme);
        },
        invalidate(): void {},
      };

      const timer = setInterval(() => {
        grid = step(grid);
        generation += 1;
        tui.requestRender();
        if (generation >= MAX_GENERATIONS) {
          clearInterval(timer);
        }
      }, TICK_MS);

      // Clean up the interval when the header is replaced or the session ends.
      (component as typeof component & { dispose?: () => void }).dispose = () =>
        clearInterval(timer);

      return component;
    });
  });
}
