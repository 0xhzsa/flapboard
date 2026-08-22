export const ROWS = 6;
export const COLS = 22;

// Cycling order used by the flap animation (space first, like real boards).
export const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!'+-?/()%$&#@=";

// Solid colour flap codes -> CSS class suffix
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

export const PALETTE_CODES = Object.keys(COLOR_TILES); // R O Y G B V W K

export function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => " "));
}

const col = (code) => ({ c: COLOR_TILES[code] });

export function centerRow(grid, rowIdx, text) {
  const t = String(text).toUpperCase().slice(0, COLS);
  const pad = Math.max(0, Math.floor((COLS - t.length) / 2));
  const chars = t.split("");
  for (let i = 0; i < t.length; i++) grid[rowIdx][pad + i] = chars[i];
}

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
      let rest = w;
      while (rest.length > width) {
        lines.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function placeCentered(grid, lines) {
  const start = Math.max(0, Math.floor((ROWS - lines.length) / 2));
  lines.slice(0, ROWS).forEach((l, i) => centerRow(grid, start + i, l));
}

export function messageLines(msg) {
  return String(msg)
    .split("|")
    .flatMap((part) => wrapText(part.trim(), COLS))
    .slice(0, 4);
}

export function paintRun(grid, rowIdx, colStart, code, count) {
  for (let i = 0; i < count && colStart + i < COLS; i++) {
    grid[rowIdx][colStart + i] = col(code);
  }
}

/** Stamp pixel-art (array of strings; '.' = skip, letters = palette codes) into the grid. */
export function stamp(grid, topRow, leftCol, art) {
  art.forEach((line, r) => {
    const y = topRow + r;
    if (y < 0 || y >= ROWS) return;
    for (let i = 0; i < line.length; i++) {
      const x = leftCol + i;
      if (x < 0 || x >= COLS) continue;
      const code = line[i].toUpperCase();
      if (code === "." || code === " ") continue;
      if (!COLOR_TILES[code]) continue;
      grid[y][x] = col(code);
    }
  });
}

export function corners(grid, code = "W") {
  grid[0][0] = col(code);
  grid[0][COLS - 1] = col(code);
  grid[ROWS - 1][0] = col(code);
  grid[ROWS - 1][COLS - 1] = col(code);
}
