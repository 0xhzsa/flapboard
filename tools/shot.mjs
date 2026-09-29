// Screenshot helper: node tools/shot.mjs <url> <out.png> [w] [h] [waitMs]
import puppeteer from "puppeteer";

const [url, out, w = "1600", h = "900", wait = "6000"] = process.argv.slice(2);

const browser = await puppeteer.launch({
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1"],
});
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h, isMobile: +w < 500, hasTouch: +w < 500 });

const problems = [];
page.on("pageerror", (e) => problems.push("PAGEERROR: " + e.message));
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) problems.push("CONSO " + m.type() + ": " + m.text());
});

await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, +wait));
await page.screenshot({ path: out });
console.log(problems.length ? problems.join("\n") : "clean");
await browser.close();
