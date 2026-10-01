// Regression tests for the cake recipe slides.
// node tools/qa-recipes.mjs <url>
import puppeteer from "puppeteer";

const url = process.argv[2] || "http://localhost:8787/app/?demo=1&quiet=1";

const browser = await puppeteer.launch({
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  // third-party feeds (TheMealDB, Yahoo, ESPN, CoinGecko) get blocked or rate
  // limited in places; those are covered by their own fallbacks. A failure to
  // load one of OUR files is a real failure.
  const where = m.location()?.url || "";
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(where)) return;
  if (/CORS|ERR_FAILED|favicon|Cross-Origin/i.test(t)) return;
  errors.push(`CONSOLE ${t.slice(0, 160)} @ ${where}`);
});

const read = () =>
  page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll("#board .tile"));
    const rows = [];
    for (let r = 0; r < 6; r++) {
      rows.push(tiles.slice(r * 22, r * 22 + 22).map((t) => t.querySelector(".face.top i").textContent).join(""));
    }
    return { id: window.__slideId, rows, key: rows.join("/") };
  });

// flaps animate; only trust a board whose text repeats
async function settled() {
  for (let i = 0; i < 40; i++) {
    const a = await read();
    await new Promise((r) => setTimeout(r, 300));
    const b = await read();
    if (a.key === b.key && a.key.trim()) return b;
  }
  return read();
}

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 12000));

// walk the whole rotation and keep every distinct settled frame
const frames = [];
const seen = new Set();
for (let i = 0; i < 90; i++) {
  const s = await settled();
  if (!seen.has(s.key)) {
    seen.add(s.key);
    frames.push(s);
  }
  await page.keyboard.press("ArrowRight");
  await new Promise((r) => setTimeout(r, 400));
}

const recipeFrames = frames.filter((f) => /^recipe/.test(f.id));
const ids = recipeFrames.map((f) => f.id);
const text = recipeFrames.flatMap((f) => f.rows).join("\n");

check("title slide renders", ids.includes("recipe"), `ids: ${[...new Set(ids)].join(", ")}`);
check("ingredients slide renders", ids.includes("recipe-buy"));
check("method slide renders", ids.includes("recipe-method"));
check("qr slide renders", ids.includes("recipe-qr"));
check("a cake name is shown", /[A-Z]{3}/.test(recipeFrames[0]?.rows.join("") || ""), recipeFrames[0]?.rows[2]?.trim());
check("ingredients are listed", /YOU WILL NEED/.test(text));
check("method is numbered", /\b1\./.test(text));
// a "3/4" header must correspond to a real 4th page, otherwise it promises a
// slide the rotation never shows
const headers = recipeFrames.flatMap((f) => f.rows.map((r) => r.match(/^(?:METHOD|YOU WILL NEED)\s+(\d+)\/(\d+)/)?.[0] || "")).filter(Boolean);
const badCount = headers.filter((h) => {
  const [n, total] = h.match(/(\d+)\/(\d+)/).slice(1).map(Number);
  const kind = h.startsWith("METHOD") ? "recipe-method" : "recipe-buy";
  return total < n || recipeFrames.filter((f) => f.id === kind).length !== total;
});
check("page counts match the pages shown", badCount.length === 0, `bad headers: ${[...new Set(badCount)].join(", ")}`);
check("no mid-flip garbage in a settled frame", !/[^\x20-\x7E\n]/.test(text));
check("no page errors", errors.length === 0, errors.join(" | "));

for (const { name, ok, detail } of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
console.log(`\nrecipe frames:\n${recipeFrames.map((f) => `[${f.id}]\n${f.rows.map((r) => "  |" + r + "|").join("\n")}`).join("\n")}`);
if (errors.length) console.log("\nerrors:\n" + errors.join("\n"));

await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);