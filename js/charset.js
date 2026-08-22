export const ROWS = 6;
export const COLS = 22;

// Cycling order used by the flap animation (space first, like real boards).
export const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!'+-?/()%$&#@=";

export const COLOR_TILES = {
  R: "red",
  O: "orange",
  Y: "yellow",
  G: "green",
  B: "blue",
  V: "violet",
  W: "white",
  K: "black",
};

export function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => " "));
}

export function centerRow(grid, rowIdx, text) {
  const t = String(text).toUpperCase().slice(0, COLS);
  const pad = Math.max(0, Math.floor((COLS - t.length) / 2));
  const chars = t.split("");
  for (let i = 0; i < t.length; i++) grid[rowIdx][pad + i] = chars[i];
}

/** Word-wrap text to full-width rows of <= COLS chars. */
export function wrapText(text, width = COLS - 2) {
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? line + " " + w : w;
    if (candidate.length <= width) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      // hard-break words longer than the board
      let rest = w;
      while (rest.length > width) {
        lines.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/** Place wrapped lines vertically centered on the grid, horizontally centered. */
export function placeCentered(grid, lines) {
  const start = Math.max(0, Math.floor((ROWS - lines.length) / 2));
  lines.forEach((l, i) => centerRow(grid, start + i, l));
}

/**
 * Parse a message into lines. "|" forces a break, otherwise auto-wrap.
 * Returns array of strings (each <= COLS).
 */
export function messageLines(msg) {
  return String(msg)
    .split("|")
    .flatMap((part) => wrapText(part.trim(), COLS))
    .slice(0, 4);
}

/** Paint a horizontal run of colour tiles on a row. */
export function paintRun(grid, rowIdx, colStart, code, count) {
  for (let i = 0; i < count && colStart + i < COLS; i++) {
    grid[rowIdx][colStart + i] = { c: COLOR_TILES[code] };
  }
}
