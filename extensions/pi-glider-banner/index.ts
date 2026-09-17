/**
 * pi-glider-banner — custom startup header for the pi-glider agent.
 *
 * Replaces Pi's built-in "pi vX.Y.Z" header with a Conway's Game of Life
 * "glider" (the old-school hacker symbol the project is named after) rendered
 * in Unicode full blocks, beside a "pi-glider vX.Y.Z" label.
 *
 * The glider is shown statically by default. Animating it (the glider looping
 * across the grid via toroidal wrap-around) is supported but disabled: each
 * animation frame triggers a full TUI re-render, which snaps the terminal
 * scroll to the header. Set ANIMATE = true to re-enable the loop.
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";

// ─── Game of Life (toroidal wrap-around) ─────────────────────────────────────

const COLS = 28;
const ROWS = 7;
const ALIVE = "█";
const DEAD = "░"; // light shade — subtle background block for dead cells
const TICK_MS = 100;

/** Animate the glider looping across the grid at startup. See header note. */
const ANIMATE = false;

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

/** Advance one generation (B3/S23) with wrap-around boundaries so the glider loops. */
function step(g: number[][]): number[][] {
  const next = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = (r + dr + ROWS) % ROWS;
          const cc = (c + dc + COLS) % COLS;
          n += g[rr][cc];
        }
      }
      next[r][c] = g[r][c] ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
    }
  }
  return next;
}

/** Render a grid to colored Unicode-block lines (alive = accent, dead = muted). */
function renderLines(g: number[][], theme: Theme): string[] {
  return g.map((row) =>
    row.map((cell) => (cell ? theme.fg("accent", ALIVE) : theme.fg("muted", DEAD))).join(""),
  );
}

// ─── Static glider ───────────────────────────────────────────────────────────

const GLIDER_PATTERN = ["░█░", "░░█", "███"];

// Terminal cells are ~2:1 (taller than wide), so use twice as many horizontal
// characters as vertical to make each cell render as a square rather than a
// column. CELL_W = 2 × CELL_H.
const CELL_W = 4; // horizontal characters per cell
const CELL_H = 2; // vertical characters per cell

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

function renderStatic(theme: Theme): string[] {
  const lines = scalePattern(GLIDER_PATTERN, CELL_W, CELL_H).map((row) =>
    row
      .split("")
      .map((c) => (c === ALIVE ? theme.fg("accent", ALIVE) : theme.fg("muted", DEAD)))
      .join(""),
  );
  // Put the label beside the glider's middle row.
  const mid = Math.floor((lines.length - 1) / 2);
  lines[mid] += `  ${theme.bold("pi-glider")}${theme.fg("dim", ` v${VERSION}`)}`;
  return lines;
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return; // skip in print/RPC (non-interactive) modes

    ctx.ui.setHeader((tui, theme) => {
      if (ANIMATE) {
        let grid = makeGrid();
        const component = {
          render(_width: number): string[] {
            return renderLines(grid, theme);
          },
          invalidate(): void {},
        };
        const timer = setInterval(() => {
          grid = step(grid);
          tui.requestRender();
        }, TICK_MS);
        (component as typeof component & { dispose?: () => void }).dispose = () =>
          clearInterval(timer);
        return component;
      }

      const lines = renderStatic(theme);
      return {
        render(_width: number): string[] {
          return lines;
        },
        invalidate(): void {},
      };
    });
  });
}
