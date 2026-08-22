// Capture one real screenshot per slide type for the landing page.
import puppeteer from "puppeteer";
import { mkdirSync } from "fs";
mkdirSync("assets", { recursive: true });

const browser = await puppeteer.launch({ headless: "shell", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810 });

await page.goto("http://localhost:8787/app/?demo=1&quiet=1", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 7000)); // boot

const want = ["clock", "weather", "sports", "stocks", "markets", "events"];
const got = new Set();
for (let step = 0; step < want.length * 3 && got.size < want.length; step++) {
  const id = await page.evaluate(() => window.__slideId);
  if (id && want.includes(id) && !got.has(id)) {
    // wait for flips to settle
    await new Promise((r) => setTimeout(r, 1800));
    const id2 = await page.evaluate(() => window.__slideId);
    if (id2 === id) {
      await page.screenshot({ path: `assets/slide-${id}.png` });
      got.add(id);
      console.log("captured", id);
    }
  }
  await page.keyboard.press("ArrowRight");
  await new Promise((r) => setTimeout(r, 2400));
}
console.log("done:", [...got].join(","));
await browser.close();
