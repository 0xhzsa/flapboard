import { ROWS, COLS, CHARS } from "./charset.js";
import { sound } from "./sound.js";

const IDX = new Map([...CHARS].map((ch, i) => [ch, i]));
const LEN = CHARS.length;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class FlapTile {
  constructor(parent) {
    this.el = document.createElement("div");
    this.el.className = "tile";
    this.topFace = this._face("top");
    this.botFace = this._face("bot");
    this.el.append(this.topFace, this.botFace);
    parent.appendChild(this.el);
    this.char = " ";
    this.color = null;
    this.busy = false;
    this._token = 0;
  }

  _face(pos) {
    const f = document.createElement("div");
    f.className = "face " + pos;
    const i = document.createElement("i");
    f.appendChild(i);
    return f;
  }

  setStatic(ch) {
    this.topFace.firstChild.textContent = ch;
    this.botFace.firstChild.textContent = ch;
    this.char = ch;
  }

  setColor(name) {
    if (this.color) this.el.classList.remove("c-" + this.color);
    this.color = name;
    if (name) {
      this.el.classList.add("c-" + name);
      this.setStatic(" ");
    }
  }

  /** One physical half-flap rotation to `next`. Resolves when landed. */
  async flipOnce(next, stepMs) {
    // top leaf swings down showing the next character's upper half
    const leafTop = this._face("top");
    leafTop.classList.add("leaf");
    leafTop.firstChild.textContent = next;
    this.el.appendChild(leafTop);
    try {
      await leafTop.animate(
        [{ transform: "rotateX(0deg)" }, { transform: "rotateX(-89deg)" }],
        { duration: Math.round(stepMs * 0.45), easing: "ease-in", fill: "forwards" }
      ).finished;
    } catch (e) {}
    leafTop.remove();

    // midpoint: bottom half reveals next char, bottom leaf swings down over it
    this.botFace.firstChild.textContent = next;
    sound.click();

    const leafBot = this._face("bot");
    leafBot.classList.add("leaf");
    leafBot.firstChild.textContent = next;
    this.el.appendChild(leafBot);
    try {
      await leafBot.animate(
        [{ transform: "rotateX(89deg)" }, { transform: "rotateX(0deg)" }],
        { duration: Math.round(stepMs * 0.5), easing: "ease-out", fill: "forwards" }
      ).finished;
    } catch (e) {}
    leafBot.remove();

    this.topFace.firstChild.textContent = next;
    this.char = next;
  }

  /**
   * Spin forward through the charset until landing on `target`.
   * minSteps guarantees a satisfying flick even for tiny changes.
   */
  async spinTo(target, delayMs, maxSteps, stepMs) {
    const token = ++this._token;
    if (delayMs) await sleep(delayMs);
    if (token !== this._token) return;

    if (!this.color && target !== this.char) {
      const from = IDX.get(this.char) ?? 0;
      const to = IDX.get(target) ?? 0;
      let dist = (to - from + LEN) % LEN;
      if (dist === 0) dist = LEN; // same char -> full loop feels mechanical & right
      const steps = Math.min(dist, maxSteps);

      let prev = from;
      for (let s = 1; s <= steps; s++) {
        const idx =
          s === steps ? to : Math.round(from + ((dist * s) / steps)) % LEN;
        if (idx === prev) continue;
        prev = idx;
        await this.flipOnce(CHARS[idx], stepMs);
        if (token !== this._token) return;
      }
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

  /** Compute tile size from available space and push it into CSS vars. */
  layout() {
    const stage = document.getElementById("stage");
    if (!stage) return;
    const availW = stage.clientWidth - 34;
    const availH = stage.clientHeight - 64;
    const gap = availW > 900 ? 4 : 3;
    const ratio = 1.16;
    let cw = Math.floor(Math.min((availW - gap * (COLS - 1)) / COLS, (availH - gap * (ROWS - 1)) / ROWS / ratio));
    cw = Math.max(cw, 14);
    const chh = Math.round(cw * ratio);
    this.root.style.setProperty("--cw", cw + "px");
    this.root.style.setProperty("--chh", chh + "px");
    this.root.style.setProperty("--gap", gap + "px");
    this.root.style.setProperty("--fs", Math.round(chh * 0.72) + "px");
  }

  setAll(ch) {
    for (const row of this.tiles) for (const t of row) t.setStatic(ch);
  }

  /**
   * Transition the whole board to a new grid.
   * `cells` is ROWS x COLS of either a char string or {c:'colorName'}.
   * Unchanged tiles stay still — only what changed flips.
   */
  show(cells, { instant = false } = {}) {
    const jobs = [];
    const now = performance.now();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = cells[r][c];
        const tile = this.tiles[r][c];
        const isColor = cell && typeof cell === "object";

        if (isColor) {
          if (tile.color !== cell.c) {
            tile.setColor(cell.c);
            sound.click(0.4);
          }
          continue;
        }
        if (tile.color) {
          tile.setColor(null); // back to lettered flap; static set below
        }

        const target = String(cell ?? " ").toUpperCase()[0] || " ";
        if (target === tile.char) continue;

        if (instant || !this.animate) {
          tile._token++;
          tile.setStatic(target);
          continue;
        }

        const delay = Math.round((c * this.stagger + r * 12) % 340 + Math.random() * 60);
        jobs.push(tile.spinTo(target, delay, this.maxSteps, this.stepMs));
      }
    }
    if (jobs.length) sound.click(0.2);
    return Promise.all(jobs).then(() => now);
  }

  /** Boot flourish: every tile spins randomly before settling. */
  boot(cells) {
    const jobs = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = this.tiles[r][c];
        const cell = cells[r][c];
        const isColor = cell && typeof cell === "object";
        const target = isColor ? " " : String(cell ?? " ").toUpperCase()[0] || " ";
        if (isColor) {
          tile.setColor(cell.c);
          continue;
        }
        const delay = Math.round(r * 40 + c * 18 + Math.random() * 200);
        jobs.push(tile.spinTo(target, delay, 10, this.stepMs));
      }
    }
    return Promise.all(jobs);
  }
}
