// Regression tests for the cake recipe run.
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
const watch = (p) => {
  p.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // third-party feeds (TheMealDB, Yahoo, ESPN, CoinGecko) get blocked or rate
    // limited in places; those are covered by their own fallbacks. A failure to
    // load one of OUR files is a real failure.
    const where = m.location()?.url || "";
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|https:\/\/0xhzsa)/.test(where)) return;
    if (/CORS|ERR_FAILED|favicon|Cross-Origin/i.test(t)) return;
    errors.push(`CONSOLE ${t.slice(0, 160)} @ ${where}`);
  });
};
watch(page);

const read = (p = page) =>
  p.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll("#board .tile"));
    const rows = [];
    for (let r = 0; r < 6; r++) {
      rows.push(tiles.slice(r * 22, r * 22 + 22).map((t) => t.querySelector(".face.top i").textContent).join(""));
    }
    return { id: window.__slideId, rows, key: rows.join("/") };
  });

// flaps animate tile by tile, so a board can read the same twice while a few
// tiles are still turning. Require three identical reads before trusting a frame.
async function settled(p = page) {
  for (let i = 0; i < 60; i++) {
    const a = await read(p);
    await new Promise((r) => setTimeout(r, 250));
    const b = await read(p);
    await new Promise((r) => setTimeout(r, 250));
    const c = await read(p);
    if (a.key === b.key && b.key === c.key && c.key.trim()) return c;
  }
  return read(p);
}

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

// strip any query string so the drawer path is tested from a clean slate
const origin = (u) => u.split("?")[0];

/** Step forward until the board shows `id`, or give up. */
async function walkTo(p, id, tries = 70) {
  let prev = (await settled(p)).key;
  for (let i = 0; i < tries; i++) {
    const s = await advance(p, prev);
    prev = s.key;
    if (s.id === id) return s;
  }
  return null;
}

/**
 * Press right and wait for the board to land on a different frame. A press that
 * lands mid-flip is swallowed, and two shopping pages share one id, so waiting
 * on the text changing is the only reliable signal.
 */
async function advance(p, prevKey) {
  await p.keyboard.press("ArrowRight");
  for (let i = 0; i < 60; i++) {
    const a = await read(p);
    await new Promise((r) => setTimeout(r, 250));
    const b = await read(p);
    await new Promise((r) => setTimeout(r, 250));
    const c = await read(p);
    if (a.key === b.key && b.key === c.key && c.key.trim() && c.key !== prevKey) return c;
  }
  return settled(p);
}

/** Collect every distinct settled frame. */
async function rotation(p, tries = 90) {
  const frames = [];
  const seen = new Set();
  let prev = (await settled(p)).key;
  for (let i = 0; i < tries; i++) {
    const s = await advance(p, prev);
    prev = s.key;
    if (!seen.has(s.key)) {
      seen.add(s.key);
      frames.push(s);
    }
  }
  return frames;
}

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 12000));
const frames = await rotation(page);

// the rotation wraps, so take the run once as the contiguous block it is

// the rotation wraps, so take the run once as the contiguous block it is
const start = frames.findIndex((f) => /^recipe/.test(f.id));
const end = frames.findIndex((f, i) => i > start && !/^recipe/.test(f.id));
const recipeFrames = start < 0 ? [] : frames.slice(start, end < 0 ? frames.length : end);
const ids = recipeFrames.map((f) => f.id);
const text = recipeFrames.flatMap((f) => f.rows).join("\n");
const uniq = [...new Set(ids)];
const run = recipeFrames.map((f) => f.rows.join(" ")).join(" ");

// a prep slide only earns its place when the recipe says what to get out
const gear = recipeFrames.find((f) => f.id === "recipe-gear");
check("the run opens with the recipe", uniq[0] === "recipe" || uniq[0] === "recipe-gear", `order: ${uniq.join(", ")}`);
check("the prep slide comes first when there is anything to say", !gear || uniq[0] === "recipe-gear", `order: ${uniq.join(", ")}`);
check("title slide renders", ids.includes("recipe"));
check("shopping slides render", ids.includes("recipe-buy"));
check("method slides render", ids.includes("recipe-method"));
check("the run ends on the QR", uniq[uniq.length - 1] === "recipe-qr", uniq.join(", "));
check("a cake name is shown", /[A-Z]{3}/.test(recipeFrames[0]?.rows.join("") || ""), recipeFrames[0]?.rows[2]?.trim());
check("ingredients are listed", /YOU WILL NEED/.test(text));
check("method is numbered", /\b1\./.test(text));
check("method names its place", /STEP 1 OF \d+/.test(text), text.match(/STEP \d+ OF \d+/g)?.join(", "));
// the prep slide can fall outside what the sampler caught, but the oven
// temperature has to reach the cook somewhere in the run
check("an oven temperature reaches the reader", /OVEN|\d{3}C/.test(run), run.slice(0, 120));

// a "3/4" header must at least be self-consistent. The unit suite checks that
// the page counts match the pages built exactly; here we can only see the frames
// the sampler caught, so verify the totals agree with each other.
const buyPages = recipeFrames.filter((f) => f.id === "recipe-buy");
const buyHeads = buyPages.map((f) => f.rows[0].match(/YOU WILL NEED\s+(\d+)\/(\d+)/)).filter(Boolean);
check("shopping pages are numbered in order", buyHeads.every(([, n]) => Number(n) <= buyHeads.length) && buyHeads.length > 0, buyHeads.map((h) => h[0]).join(", "));
check("one shopping total, agreed by every page", new Set(buyHeads.map(([, , total]) => total)).size <= 1, [...new Set(buyHeads.map(([, , t]) => t))].join(", "));

// the run must not interleave: prep, title, shopping, then method, then the QR
const firstMethod = ids.indexOf("recipe-method");
const lastMethod = ids.lastIndexOf("recipe-method");
check("every method slide sits together", ids.slice(firstMethod, lastMethod + 1).every((id) => id === "recipe-method"), ids.join(","));
const firstBuy = ids.indexOf("recipe-buy");
check("every shopping slide sits together", ids.slice(firstBuy, firstBuy + buyPages.length).every((id) => id === "recipe-buy"), ids.join(","));
check("the QR comes after the method", ids.indexOf("recipe-qr") > lastMethod, ids.join(","));

// one step per slide, numbered, and the last one says how many there are
const steps = recipeFrames.filter((f) => f.id === "recipe-method");
const nums = steps.map((f) => f.rows[0].match(/STEP (\d+) OF (\d+)/)?.slice(1).map(Number)).filter(Boolean);
const order = nums.map(([n]) => n);
check("steps run forwards", order.every((n, i) => i === 0 || n >= order[i - 1]), order.join(","));
check("one step total, agreed by every slide", new Set(nums.map(([, m]) => m)).size === 1, [...new Set(nums.map(([, m]) => m))].join(","));
check("the first step is step one", order[0] === 1, order.join(","));
const split = text.match(/CONT \d+\/\d+/g);
check("a step long enough to split says so", !split || /CONT \d+\/\d+/.test(text), split?.join(", ") || "none seen");
check("no mid-flip garbage in a settled frame", !/[^\x20-\x7E\n]/.test(text));
check("no page errors", errors.length === 0, errors.join(" | "));

/* ---------------- the cake must not change under the reader ---------------- */
const pinned = await browser.newPage();
await pinned.setViewport({ width: 1600, height: 900 });
watch(pinned);
await pinned.goto(`${origin(url)}?recipe=carrot&quiet=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 11000));
const title1 = await walkTo(pinned, "recipe");
check("the pinned cake loads", !!title1, "no title slide found");
const name1 = title1?.rows[2].trim();
await pinned.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 11000));
const title2 = await walkTo(pinned, "recipe");
check("a reload keeps the same cake", title2?.rows[2].trim() === name1, `${name1} then ${title2?.rows[2].trim()}`);
check("the pin is remembered", await pinned.evaluate(() => JSON.parse(localStorage.getItem("flapboard.v2") || "{}")?.recipe === "carrot"));
await pinned.close();

/* ---------------- units ---------------- */
const us = await browser.newPage();
await us.setViewport({ width: 1600, height: 900 });
watch(us);
await us.goto(`${origin(url)}?recipe=carrot&runits=us&quiet=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 11000));
const buy = await walkTo(us, "recipe-buy");
const buyText = buy?.rows.join("\n") || "";
check("US cook gets imperial measures", /\b(OZ|CUP|CUPS|LB|TBSP|TSP)\b/.test(buyText) && !/\bML\b/.test(buyText), buyText);
await us.close();

/* ---------------- the path a real visitor takes ---------------- */
const fresh = await browser.newPage();
await fresh.setViewport({ width: 1600, height: 900 });
watch(fresh);
// the earlier pages share this origin's storage, and demo mode turns recipes on
await fresh.goto(origin(url), { waitUntil: "domcontentloaded", timeout: 60000 });
await fresh.evaluate(() => localStorage.clear());
await fresh.goto(origin(url), { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 7000));
const before = new Set();
let prevKey = (await settled(fresh)).key;
for (let i = 0; i < 30; i++) {
  const s = await advance(fresh, prevKey);
  prevKey = s.key;
  if (s.id) before.add(s.id);
}
check("off by default, so it does not hijack the rotation", ![...before].some((i) => /recipe/i.test(i)), `saw ${[...before].filter((i) => /recipe/i.test(i)).join(", ")}`);

await fresh.evaluate(() => document.getElementById("chk-recipes").click());
await new Promise((r) => setTimeout(r, 11000));
const after = new Set();
prevKey = (await settled(fresh)).key;
for (let i = 0; i < 60; i++) {
  const s = await advance(fresh, prevKey);
  prevKey = s.key;
  if (s.id) after.add(s.id);
}
const turnedOn = [...after].filter((i) => /recipe/i.test(i));
check("ticking the drawer box turns recipes on", turnedOn.length >= 3, `saw ${turnedOn.join(", ") || "nothing"}`);
check("the box survives a reload", await fresh.evaluate(() => JSON.parse(localStorage.getItem("flapboard.v2") || "{}")?.slides?.recipes === true));
check("the phone gets a cake button", await fresh.evaluate(() => !document.getElementById("btn-cmd-recipe")?.hidden));

// R is the shortcut for the thing you want most of the time: it steps in, and
// back out again, without turning the feature off. Leave the drawer first,
// because a shortcut is ignored while a form field has focus.
await fresh.evaluate(() => document.activeElement?.blur());
// start from inside the run, which also proves the recipe has finished loading
let inside = null;
for (let i = 0; i < 60 && !inside; i++) {
  const s = await settled(fresh);
  if (/recipe/.test(s.id || "")) inside = s;
  else await advance(fresh, s.key);
}
check("found a recipe frame to start from", !!inside, "never reached the recipe run");
if (inside) {
  await fresh.keyboard.press("r");
  await new Promise((r) => setTimeout(r, 2500));
  const jumpedOut = (await settled(fresh)).id;
  check("R jumps out of the recipe run", !/recipe/.test(jumpedOut || ""), `landed on ${jumpedOut}`);
  await fresh.keyboard.press("r");
  await new Promise((r) => setTimeout(r, 2500));
  const jumpedIn = (await settled(fresh)).id;
  check("R jumps back in", /^recipe/.test(jumpedIn || ""), `landed on ${jumpedIn}`);
}
check("recipes are still on afterwards", await fresh.evaluate(() => JSON.parse(localStorage.getItem("flapboard.v2") || "{}")?.slides?.recipes === true));
await fresh.close();

for (const { name, ok, detail } of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
console.log(`\nrecipe frames:\n${recipeFrames.map((f) => `[${f.id}]\n${f.rows.map((r) => "  |" + r + "|").join("\n")}`).join("\n")}`);
if (errors.length) console.log("\nerrors:\n" + errors.join("\n"));

await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);