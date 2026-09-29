// End-to-end test of the phone-as-touch pairing through the local relay.
// node tools/qa-touch.mjs <relayOrigin>
import puppeteer from "puppeteer";

const origin = process.argv[2] || "http://10.50.11.202:8788";
const log = [];
const fail = [];
const ok = (label, cond, extra = "") => {
  (cond ? log : fail).push(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " :: " + extra : ""}`);
};

const browser = await puppeteer.launch({
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu"],
});

const errors = [];
async function newPage(vw, vh) {
  const p = await browser.newPage();
  await p.setViewport({ width: vw, height: vh, isMobile: vw < 500, hasTouch: vw < 500 });
  p.on("pageerror", (e) => errors.push(`[${vw}px] PAGEERROR ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/CORS|ERR_FAILED|favicon/.test(m.text())) {
      errors.push(`[${vw}px] CONSOLE ${m.text()}`);
    }
  });
  return p;
}

const tv = await newPage(1600, 900);
await tv.goto(`${origin}/app/?demo=1&quiet=1&lock=clock`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 7000));

// The board should be showing the board, not a QR prompt, on a normal load.
const onLoad = await tv.evaluate(() => {
  const b = document.getElementById("btn-touch");
  const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    panelHidden: document.getElementById("pair").hidden,
    boardVisible: !!document.querySelector("#board .tile"),
    touchClickable: top === b,
    coveredBy: top ? `${top.tagName}#${top.id}` : "nothing",
  };
});
ok("pair panel stays closed until TOUCH is pressed", onLoad.panelHidden === true, JSON.stringify(onLoad));
ok("board renders without pairing", onLoad.boardVisible);
// an overlay with an author `display` rule outranks [hidden] and swallows the
// click without any error, so assert the button is really the hit target
ok("TOUCH button is the top element at its centre", onLoad.touchClickable, "covered by " + onLoad.coveredBy);

// open the pairing panel the way the TOUCH button does
await tv.click("#btn-touch");
await new Promise((r) => setTimeout(r, 1500));

const pair = await tv.evaluate(() => ({
  visible: !document.getElementById("pair").hidden,
  room: document.getElementById("pair-room").textContent.trim(),
  status: document.getElementById("pair-status").textContent.trim(),
  qrSrc: (document.querySelector("#pair-qr img").src || "").slice(0, 30),
  helpShown: !document.getElementById("pair-help").hidden,
}));
ok("pair panel opens", pair.visible);
ok("room code is 4 unambiguous chars", /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(pair.room), pair.room);
ok("QR rendered locally (no network)", pair.qrSrc.startsWith("data:image/gif"), pair.qrSrc);
ok("localhost help not shown on LAN url", pair.helpShown === false);
ok("waiting for phone", /WAITING/i.test(pair.status), pair.status);

// phone half joins with the room code
const phone = await newPage(390, 844);
await phone.goto(`${origin}/app/?remote#${pair.room}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 4000));

const link = await phone.evaluate(() => document.getElementById("remote-status").textContent);
ok("phone reports LINKED", link === "LINKED", link);

const tvAfter = await tv.evaluate(() => ({
  status: document.getElementById("pair-status").textContent.trim(),
  hidden: document.getElementById("pair").hidden,
}));
ok("TV saw the phone join", /CONNECTED/i.test(tvAfter.status), tvAfter.status);
ok("pair panel auto-closed on the TV", tvAfter.hidden === true);

// the mirror should be showing the board
const mirror = await phone.evaluate(() =>
  Array.from(document.querySelectorAll(".rm")).map((e) => e.textContent).join("")
);
ok("phone mirror has 132 flaps", mirror.length === 132, String(mirror.length));
ok("mirror carries board text", /\S/.test(mirror.replace(/ /g, "")), JSON.stringify(mirror.slice(0, 44)));

// tap a flap on the phone, expect the same character on the TV
const cell = { r: 3, c: 10 };
const readTile = (p, c) =>
  p.evaluate((cc) => document.querySelectorAll("#board .tile")[cc.r * 22 + cc.c].querySelector(".face.top i").textContent, c);

const before = await readTile(tv, cell);
await phone.evaluate((c) => document.querySelector(`.rm[data-r="${c.r}"][data-c="${c.c}"]`).click(), cell);
// poll instead of sleeping a fixed amount: the flip is rAF driven and a
// message can be dropped if the relay is briefly busy
let after = before;
for (let i = 0; i < 40 && after === before; i++) {
  await new Promise((r) => setTimeout(r, 250));
  after = await readTile(tv, cell);
}
ok("tapping a flap changes it on the TV", before !== after, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

// the clock slide is regenerated on a 15s tick, which used to silently put the
// old letter back. Only assert if a minute boundary actually falls in the wait.
const minBefore = await tv.evaluate(() => new Date().getMinutes());
await new Promise((r) => setTimeout(r, 17000));
const minAfter = await tv.evaluate(() => new Date().getMinutes());
const afterRedraw = await readTile(tv, cell);
if (minBefore !== minAfter) {
  ok("the edited letter survives the time-based redraw", afterRedraw === after, `${JSON.stringify(after)} -> ${JSON.stringify(afterRedraw)} across a minute tick`);
} else {
  console.log(`SKIP edited-letter redraw test :: no minute boundary in the 17s window (still ${minAfter})`);
}

// type a message on the phone, expect it painted across the whole TV board
await phone.type("#remote-input", "HELLO FROM THE PHONE");
await phone.click("#remote-form button[type=submit]");
await new Promise((r) => setTimeout(r, 9000));
const typed = await tv.evaluate(() => ({
  slide: window.__slideId,
  row: document.querySelectorAll("#board .tile")[2 * 22 + 4].querySelector(".face.top i").textContent,
  text: Array.from(document.querySelectorAll("#board .tile"))
    .slice(2 * 22, 3 * 22)
    .map((t) => t.querySelector(".face.top i").textContent)
    .join(""),
  paused: document.getElementById("status-left").textContent,
}));
ok("typed message became a slide", typed.slide === "typed", String(typed.slide));
ok("typed text painted on the board", typed.text.includes("HELLO"), JSON.stringify(typed.text));
ok("rotation paused while the typed slide shows", typed.paused === "PAUSED", typed.paused);

// remote slide controls
await phone.evaluate(() => document.querySelector('[data-cmd="next"]').click());
await new Promise((r) => setTimeout(r, 2500));

// closing the panel kills the link, so reopening it must start a fresh room
// rather than show a dead QR code.
await tv.click("#btn-touch");
await new Promise((r) => setTimeout(r, 800));
await tv.click("#pair-close");
await new Promise((r) => setTimeout(r, 400));
const afterClose = await tv.evaluate(() => document.getElementById("pair").hidden);
ok("pair panel closes", afterClose === true);

await tv.click("#btn-touch");
await new Promise((r) => setTimeout(r, 1200));
const reopened = await tv.evaluate(() => ({
  visible: !document.getElementById("pair").hidden,
  room: document.getElementById("pair-room").textContent.trim(),
  status: document.getElementById("pair-status").textContent.trim(),
}));
ok("pair panel reopens", reopened.visible === true);
ok("reopening starts a fresh listening room", /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(reopened.room), reopened.room);
ok("reopened panel is waiting, not dead", /WAITING/i.test(reopened.status), reopened.status);

console.log(log.join("\n"));
if (fail.length) console.log("\n" + fail.join("\n"));
console.log(errors.length ? "\nPAGE ERRORS:\n" + errors.join("\n") : "\nno page errors");
console.log(`\n${log.length} passed, ${fail.length} failed`);
await browser.close();
process.exit(fail.length ? 1 : 0);
