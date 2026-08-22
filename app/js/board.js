import { ROWS, COLS, CHARS, COLOR_TILES, PALETTE_CODES } from "./charset.js";
import { sound } from "./sound.js";

const IDX = new Map([...CHARS].map((ch, i) => [ch, i]));
const LEN = CHARS.length;
const VALID_COLS = new Set(Object.values(COLOR_TILES));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tile state: lettered flap ({ch:'A', col:null}) or solid colour flap ({ch:' ', col:'red'}). */
const stateOf = (cell) => {
  if (cell && typeof cell === "object") return { ch: " ", col: VALID_COLS.has(cell.c) ? cell.c : null };
  const ch = String(cell ?? " ").toUpperCase()[0] || " ";
  return { ch: IDX.has(ch) ? ch : " ", col: null };
};
const sameState = (a, b) => a.ch === b.ch && (a.col || null) === (b.col || null);

class FlapTile {
  constructor(parent) {
    this.el = document.createElement("div");
    this.el.className = "tile";
    this.topFace = this._face("top");
    this.botFace = this._face("bot");
    this.el.append(this.topFace, this.botFace);
    parent.appendChild(this.el);
    this.state = { ch: " ", col: null };
    this._token = 0;
  }

  _face(pos) {
    const f = document.createElement("div");
    f.className = "face " + pos;
    const i = document.createElement("i");
    f.appendChild(i);
    return f;
  }

  /** Paint a static face with a state. */
  _paint(face, s) {
    face.firstChild.textContent = s.col ? " " : s.ch;
  }

  setStatic(s) {
    // tile-level colour class drives static backgrounds via CSS
    const prev = this.state.col;
    if (prev) this.el.classList.remove("c-" + prev);
    this.state = { ...s };
    if (s.col) this.el.classList.add("c-" + s.col);
    this._paint(this.topFace, s);
    this._paint(this.botFace, s);
  }

  /**
   * One physical half-flip to state `next`.
   * The top leaf swings down (showing next's top half), bottom swaps at the
   * midpoint, the bottom leaf swings down over it.
   */
  async flipOnce(next, stepMs) {
    const mkLeaf = (pos) => {
      const f = this._face(pos);
      f.classList.add("leaf");
      if (next.col) {
        f.classList.add("c-" + next.col);
        f.firstChild.textContent = " ";
      } else {
        f.firstChild.textContent = next.ch;
      }
      return f;
    };

    const leafTop = mkLeaf("top");
    this.el.appendChild(leafTop);
    try {
      await leafTop.animate(
        [{ transform: "rotateX(0deg)" }, { transform: "rotateX(-89deg)" }],
        { duration: Math.round(stepMs * 0.45), easing: "ease-in", fill: "forwards" }
      ).finished;
    } catch (e) {}
    leafTop.remove();

    // midpoint: bottom half adopts the next state
    const prevCol = this.state.col;
    if (prevCol) this.el.classList.remove("c-" + prevCol);
    this.state = { ...next };
    if (next.col) this.el.classList.add("c-" + next.col);
    this._paint(this.botFace, next);
    sound.click();

    const leafBot = mkLeaf("bot");
    this.el.appendChild(leafBot);
    try {
      await leafBot.animate(
        [{ transform: "rotateX(89deg)" }, { transform: "rotateX(0deg)" }],
        { duration: Math.round(stepMs * 0.5), easing: "ease-out", fill: "forwards" }
      ).finished;
    } catch (e) {}
    leafBot.remove();

    this._paint(this.topFace, next);
  }

  /** Build the intermediate states between current and target. */
  _pathTo(target, maxSteps) {
    const cur = this.state;
    const path = [];
    const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

    if (cur.col && target.col) {
      // colour -> colour: flutter through other palette colours
      const others = PALETTE_CODES.map((c) => COLOR_TILES[c]).filter((c) => c !== target.col);
      const n = Math.min(maxSteps - 1, 3);
      for (let i = 0; i < n; i++) path.push({ ch: " ", col: rnd(others) });
    } else if (!cur.col !== !target.col) {
      // letter <-> colour: one colour beat in between
      const others = PALETTE_CODES.map((c) => COLOR_TILES[c]).filter((c) => c !== target.col);
      path.push({ ch: " ", col: rnd(others) });
      if (!target.col) {
        const from = IDX.get(cur.ch) ?? 0;
        const to = IDX.get(target.ch) ?? 0;
        let dist = (to - from + LEN) % LEN;
        if (dist === 0) dist = LEN;
        const midSteps = Math.min(2, Math.max(1, maxSteps - 2));
        for (let i = 1; i <= midSteps; i++) {
          path.push({ ch: CHARS[Math.round(from + (dist * i) / (midSteps + 1)) % LEN], col: null });
        }
      }
    } else {
      // letter -> letter: spin forward through the charset
      const from = IDX.get(cur.ch) ?? 0;
      const to = IDX.get(target.ch) ?? 0;
      let dist = (to - from + LEN) % LEN;
      if (dist === 0) dist = LEN;
      const steps = Math.min(dist, maxSteps - 1);
      for (let s = 1; s < steps; s++) {
        path.push({ ch: CHARS[Math.round(from + (dist * s) / steps) % LEN], col: null });
      }
    }
    path.push(target);
    return path.slice(0, maxSteps + 1);
  }

  async spinTo(targetState, delayMs, maxSteps, stepMs) {
    const token = ++this._token;
    if (delayMs) await sleep(delayMs);
    if (token !== this._token) return;

    if (sameState(this.state, targetState)) return;
    const path = this._pathTo(targetState, maxSteps);
    for (const s of path) {
      await this.flipOnce(s, stepMs);
      if (token !== this._token) return;
    }
  }
}

export class Board {
  constructor(root) {
    this.root = root;
    this.tiles = [];
    this.stepMs = 52;
    this.maxSteps = 6;
    this.animate = true;
    this.stagger = 26;
    this._build();
    this.layout();
    window.addEventListener("resize", () => this.layout());
  }

  _build() {
    this.root.innerHTML = "";
    this.tiles = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(new FlapTile(this.root));
      this.tiles.push(row);
    }
  }

  layout() {
    const stage = document.getElementById("stage");
    if (!stage) return;
    const availW = stage.clientWidth - 34;
    const availH = stage.clientHeight - 64;
    const gap = availW > 900 ? 4 : 3;
    const ratio = 1.16;
    let cw = Math.floor(
      Math.min((availW - gap * (COLS - 1)) / COLS, (availH - gap * (ROWS - 1)) / ROWS / ratio)
    );
    cw = Math.max(cw, 14);
    const chh = Math.round(cw * ratio);
    this.root.style.setProperty("--cw", cw + "px");
    this.root.style.setProperty("--chh", chh + "px");
    this.root.style.setProperty("--gap", gap + "px");
    this.root.style.setProperty("--fs", Math.round(chh * 0.78) + "px");
  }

  setAll(ch) {
    for (const row of this.tiles) for (const t of row) t.setStatic({ ch, col: null });
  }

  /** Transition to a new grid; only tiles whose state changed will flip. */
  show(cells, { instant = false } = {}) {
    const jobs = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const target = stateOf(cells[r][c]);
        const tile = this.tiles[r][c];
        if (sameState(tile.state, target)) continue;
        if (instant || !this.animate) {
          tile._token++;
          tile.setStatic(target);
          continue;
        }
        const delay = Math.round(((c * this.stagger + r * 12) % 340) + Math.random() * 60);
        jobs.push(tile.spinTo(target, delay, this.maxSteps, this.stepMs));
      }
    }
    if (jobs.length) sound.click(0.2);
    return Promise.all(jobs);
  }

  /** Boot flourish: diagonal wave of spins settling into the greeting. */
  boot(cells) {
    const jobs = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = this.tiles[r][c];
        const target = stateOf(cells[r][c]);
        const delay = Math.round(r * 55 + c * 22 + Math.random() * 180);
        jobs.push(tile.spinTo(target, delay, Math.max(this.maxSteps, 8), this.stepMs));
      }
    }
    return Promise.all(jobs);
  }
}
