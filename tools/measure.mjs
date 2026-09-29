// Measure real flap geometry + legibility in a headless browser.
// node tools/measure.mjs <url> [w] [h]
import puppeteer from "puppeteer";

const [url, w = "1600", h = "900"] = process.argv.slice(2);

const browser = await puppeteer.launch({
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h, isMobile: +w < 500, hasTouch: +w < 500 });
await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 6000));

const m = await page.evaluate(() => {
  const board = document.getElementById("board") || document.querySelector("#heroBoard, #board");
  if (!board) return { error: "no board" };
  const b = board.getBoundingClientRect();
  const tile = board.querySelector(".tile");
  const glyph = board.querySelector(".face i");
  const cs = getComputedStyle(document.documentElement);
  const tileCs = getComputedStyle(tile);
  const g = glyph.getBoundingClientRect();

  // widest glyph actually rendered, as a share of tile width
  const measure = (ch) => {
    const s = document.createElement("span");
    s.textContent = ch;
    s.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${getComputedStyle(glyph).fontFamily};font-stretch:${getComputedStyle(glyph).fontStretch};font-weight:${getComputedStyle(glyph).fontWeight};font-size:${getComputedStyle(glyph).fontSize}`;
    document.body.appendChild(s);
    const r = s.getBoundingClientRect().width;
    s.remove();
    return r;
  };
  const wM = measure("M");
  const wI = measure("I");

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    boardPx: { w: Math.round(b.width), h: Math.round(b.height) },
    overflowsX: Math.round(b.right) > window.innerWidth,
    overflowsY: Math.round(b.bottom) > window.innerHeight,
    tilePx: Math.round(parseFloat(tileCs.width)),
    gap: getComputedStyle(board).gap,
    fontSize: getComputedStyle(glyph).fontSize,
    fontFamily: getComputedStyle(glyph).fontFamily.split(",")[0],
    fontStretch: getComputedStyle(glyph).fontStretch,
    tileRadius: tileCs.borderRadius,
    glyphColor: getComputedStyle(glyph).color,
    widestGlyphPx: Math.round(wM),
    glyphFillPct: Math.round((wM / parseFloat(tileCs.width)) * 100),
    airBetweenLettersPx: Math.round(parseFloat(tileCs.width) - wM + parseFloat(getComputedStyle(board).gap)),
    narrowestGlyphPx: Math.round(wI),
  };
});

console.log(JSON.stringify(m, null, 2));
await browser.close();
