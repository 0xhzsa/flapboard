// Pre-flight audit for the landing page: mechanical checks from the design rules.
// node tools/audit.mjs <url> [w] [h]
import puppeteer from "puppeteer";

const [url, w = "1440", h = "900"] = process.argv.slice(2);

const browser = await puppeteer.launch({ headless: "shell", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h });
await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));

const r = await page.evaluate(() => {
  const out = { checks: [], hero: null, palette: {} };
  const add = (name, pass, detail) => out.checks.push({ name, pass, detail });

  const html = document.documentElement.outerHTML;
  const text = document.body.innerText;

  // em / en dash anywhere
  const dashes = text.match(/[\u2014\u2013]/g);
  add("no em or en dashes", !dashes, dashes ? dashes.join("") : "0");

  // decorative screenshot images
  const imgs = Array.from(document.images);
  add("no screenshot images", imgs.length === 0, imgs.length + " img tags");

  // nothing may push the page sideways; name the culprits so it is fixable
  const docW = document.documentElement.scrollWidth;
  const wide = Array.from(document.querySelectorAll("body *"))
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
    .slice(0, 6)
    .map((el) => {
      const b = el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className ? "." + String(el.className).split(" ")[0] : ""}@${Math.round(b.left)}..${Math.round(b.right)}`;
    });
  add("no horizontal page scroll", docW <= window.innerWidth + 1, `scrollWidth ${docW} vs ${window.innerWidth} :: ${wide.join(", ") || "no element past the edge"}`);

  // CTA intent: the same intent must carry the same label everywhere.
  // "OPEN THE BOARD" in the nav and the hero is one intent, correctly labelled.
  const primary = Array.from(document.querySelectorAll(".btn-primary")).map((a) => a.textContent.trim().toUpperCase());
  const ghost = Array.from(document.querySelectorAll(".hero-cta .btn-ghost")).map((a) => a.textContent.trim().toUpperCase());
  add("one label per CTA intent", new Set(primary).size === 1, "primary: " + [...new Set(primary)].join(" | "));
  add("at most one secondary CTA", ghost.length <= 1, ghost.join(" | "));

  // radius consistency
  const radii = new Set();
  for (const el of document.querySelectorAll(".btn, .brand-mark i, #heroBoard, .touch-code pre")) {
    radii.add(getComputedStyle(el).borderTopLeftRadius);
  }
  add("one radius system", radii.size === 1, [...radii].join(","));

  // eyebrow count: small mono uppercase labels that open a section. Column
  // headers inside one grouped container (SKY / MONEY / YOURS) are not eyebrows.
  const isMicro = (el) => {
    const cs = getComputedStyle(el);
    return (
      el.textContent.trim().length < 24 &&
      /mono/i.test(cs.fontFamily) &&
      parseFloat(cs.fontSize) <= 13 &&
      cs.textTransform === "uppercase"
    );
  };
  const eyebrows = Array.from(document.querySelectorAll("main > section")).filter(
    (s) => s.firstElementChild && isMicro(s.firstElementChild)
  );
  const sectionCount = document.querySelectorAll("main > section").length;
  add("eyebrow restraint (fewer than half the sections)", eyebrows.length < sectionCount / 2, eyebrows.length + " of " + sectionCount + " sections");

  // headings order
  const hs = Array.from(document.querySelectorAll("h1,h2,h3")).map((h) => h.tagName);
  add("exactly one h1", hs.filter((t) => t === "H1").length === 1, hs.join(","));

  // hero fit: CTA visible without scrolling
  const cta = document.querySelector(".hero-cta .btn");
  if (cta) {
    const b = cta.getBoundingClientRect();
    out.hero = {
      ctaBottom: Math.round(b.bottom),
      viewportH: window.innerHeight,
      heroHeight: Math.round(document.querySelector(".hero").getBoundingClientRect().height),
      h1Lines: Math.round(
        document.querySelector("h1").getBoundingClientRect().height /
          parseFloat(getComputedStyle(document.querySelector("h1")).lineHeight)
      ),
    };
    add("hero CTA above the fold", b.bottom <= window.innerHeight, JSON.stringify(out.hero));
    add("hero headline is 2 lines or fewer", out.hero.h1Lines <= 2, out.hero.h1Lines + " lines");
  }

  // body copy contrast
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((v) => {
      v = +v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return +((x + 0.05) / (y + 0.05)).toFixed(2);
  };
  const bg = getComputedStyle(document.body).backgroundColor;
  const samples = {};
  for (const sel of [".sub", ".band-sub", ".cluster p", ".cluster li", ".code-note", ".foot-dim", ".hero-caption"]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    samples[sel] = {
      px: parseFloat(getComputedStyle(el).fontSize),
      ratio: ratio(getComputedStyle(el).color, bg),
    };
  }
  out.samples = samples;
  const worst = Object.entries(samples).filter(([, v]) => v.ratio < 4.5);
  add("body text clears WCAG AA (4.5:1)", worst.length === 0, worst.map(([k, v]) => `${k}=${v.ratio}@${v.px}px`).join(", ") || "all pass");

  // buttons
  for (const a of document.querySelectorAll(".btn")) {
    const cs = getComputedStyle(a);
    const bgC = cs.backgroundColor === "rgba(0, 0, 0, 0)" ? bg : cs.backgroundColor;
    const cr = ratio(cs.color, bgC);
    out.palette[a.textContent.trim().toUpperCase()] = cr;
    add(`button contrast ${a.textContent.trim().toUpperCase()}`, cr >= 4.5, cr + ":1");
  }

  // the hero board must sit inside its own frame, and its letters must fit
  // their own flaps (the fit dial widens glyphs, so this can regress)
  const hb = document.getElementById("heroBoard");
  if (hb) {
    // Board puts the flaps straight into the mount, so the mount IS the grid.
    // Measure the real extent of the flaps rather than deriving it from counts.
    const frame = hb.getBoundingClientRect();
    const tiles = Array.from(hb.querySelectorAll(":scope > .tile"));
    let minL = Infinity, maxR = -Infinity, minT = Infinity, maxB = -Infinity;
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      minL = Math.min(minL, r.left);
      maxR = Math.max(maxR, r.right);
      minT = Math.min(minT, r.top);
      maxB = Math.max(maxB, r.bottom);
    }
    const gridW = tiles.length ? maxR - minL : 0;
    const gridH = tiles.length ? maxB - minT : 0;
    const fits = gridW <= frame.width + 1 && gridH <= frame.height + 1;
    const t0 = tiles[0]?.getBoundingClientRect();
    out.heroBoard = {
      frame: `${Math.round(frame.width)}x${Math.round(frame.height)}`,
      grid: `${Math.round(gridW)}x${Math.round(gridH)}`,
      flapCount: tiles.length,
      display: getComputedStyle(hb).display,
      fits,
    };
    add("hero board lays out as a 6x22 grid", getComputedStyle(hb).display === "grid" && tiles.length === 132, JSON.stringify(out.heroBoard));
    add("hero board fits inside its frame", fits, JSON.stringify(out.heroBoard));

    // `.face i` is a full-width flex box, so its rect is the tile, not the
    // letter. Probe a real glyph with the same computed font instead.
    const glyph = hb.querySelector(".face i");
    const probe = (ch) => {
      const s = document.createElement("span");
      s.textContent = ch;
      s.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${getComputedStyle(glyph).fontFamily};font-stretch:${getComputedStyle(glyph).fontStretch};font-weight:${getComputedStyle(glyph).fontWeight};font-size:${getComputedStyle(glyph).fontSize}`;
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return w;
    };
    const tileW = t0 ? t0.width : 0;
    const widest = probe("M");
    const fill = tileW ? Math.round((widest / tileW) * 100) : 0;
    out.heroBoard.widestPct = fill;
    out.heroBoard.tilePx = Math.round(tileW);
    add("hero letters stay on their own flap", fill > 0 && fill <= 96, `${fill}% of a ${Math.round(tileW)}px flap`);
  }

  return out;
});

// The board drives its flips with rAF, not the Web Animations API, so
// document.getAnimations() is always empty. Poll the live transforms instead:
// a single flip only lasts ~250ms, so one offhand sample usually lands in the
// gap between slides. Sample across a full reel cycle to catch it reliably.
const motion = await page.evaluate(
  () =>
    new Promise((done) => {
      const el = document.getElementById("heroBoard");
      const seen = new Set();
      const labels = new Set();
      const t0 = performance.now();
      const tick = () => {
        const leaves = el ? el.querySelectorAll(".face.leaf") : [];
        seen.add(Array.from(leaves).map((f) => f.style.transform).join("|"));
        labels.add((document.getElementById("heroLabel") || {}).textContent);
        if (performance.now() - t0 < 9000) requestAnimationFrame(tick);
        else done({ distinctTransforms: seen.size, distinctLabels: labels.size });
      };
      tick();
    })
);

for (const c of r.checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.detail ? " :: " + c.detail : ""}`);
const reels = motion.distinctLabels >= 2;
const flips = motion.distinctTransforms >= 3;
console.log(`${flips ? "PASS" : "FAIL"} flaps are mid-rotation (rAF driven) :: ${motion.distinctTransforms} distinct transform states`);
console.log(`${reels ? "PASS" : "FAIL"} board reel advances :: ${motion.distinctLabels} distinct captions`);
console.log("\nsamples:", JSON.stringify(r.samples, null, 2));
console.log("button contrast:", JSON.stringify(r.palette));
const failed = r.checks.filter((c) => !c.pass);
const total = r.checks.length + 2;
const pass = total - failed.length - (flips ? 0 : 1) - (reels ? 0 : 1);
console.log(`\n${pass} passed, ${total - pass} failed`);
await browser.close();
