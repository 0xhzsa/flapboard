import { Board } from "./board.js";
import { loadSettings } from "./storage.js";
import { buildSlides, greetingSlide } from "./slides.js";
import { quoteForHour } from "./quotes.js";
import { cachedWeather, getWeather } from "./weather.js";
import { cachedMarkets, fetchMarkets, fmtPrice } from "./markets.js";
import { initDrawer, renderDots, toast, setWeatherStatus } from "./ui.js";
import { sound } from "./sound.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const settings = loadSettings();

/* ---------- session URL overrides (not persisted) ---------- */
if (params.get("city")) settings.city = params.get("city");
if (params.get("theme")) settings.theme = params.get("theme");
if (params.get("units")) settings.units = params.get("units").toUpperCase() === "C" ? "C" : "F";
if (params.get("speed")) settings.speed = params.get("speed");
if (params.get("dwell")) settings.dwell = Math.min(120, Math.max(4, parseInt(params.get("dwell"), 10) || settings.dwell));
if (params.has("quiet")) settings.sound = false;
const lockedSlide = params.has("lock") ? params.get("lock") || "clock" : null;
const msgsParam = params.get("msg");
const sessionMessages = msgsParam ? msgsParam.split(";").map((s) => s.trim()).filter(Boolean) : null;

document.body.dataset.theme = settings.theme;

const board = new Board($("board"));

function applySpeed() {
  switch (settings.speed) {
    case "slow": board.stepMs = 72; board.maxSteps = 8; board.animate = true; break;
    case "fast": board.stepMs = 34; board.maxSteps = 4; board.animate = true; break;
    case "off": board.animate = false; break;
    default: board.stepMs = 52; board.maxSteps = 6; board.animate = true;
  }
}
applySpeed();
sound.enabled = !!settings.sound;

/* ---------- data layer ---------- */
const data = {
  weather: null,
  markets: null,
  quote: quoteForHour(),
};
{
  const wc = cachedWeather();
  if (wc) data.weather = { ...wc.data };
  data.markets = cachedMarkets();
}

let lastFetchedCity = null;

async function refreshWeather(manual = false) {
  if (!settings.city) {
    setWeatherStatus("No city set — weather slide is hidden.");
    return;
  }
  setWeatherStatus("Fetching " + settings.city + "...");
  try {
    const w = await getWeather(settings.city);
    data.weather = w;
    lastFetchedCity = settings.city;
    setWeatherStatus(w.city + " · updated " + new Date().toLocaleTimeString());
    softRedraw();
    updateStatus();
  } catch (e) {
    setWeatherStatus("Failed: " + e.message);
    if (manual) toast("WEATHER FAILED");
  }
}

let marketsBusy = false;
async function refreshMarkets(manual = false) {
  if (marketsBusy) return;
  marketsBusy = true;
  try {
    data.markets = await fetchMarkets(settings.coins);
    softRedraw();
    updateStatus();
  } catch (e) {
    if (manual) toast("MARKETS FEED FAILED");
  } finally {
    marketsBusy = false;
  }
}

/* ---------- slide loop ---------- */
let slides = [];
let idx = 0;
let timer = null;
let paused = false;
const dotsEl = $("dots");

function effectiveSettings() {
  return sessionMessages ? { ...settings, messages: sessionMessages } : settings;
}

function rebuild() {
  const now = new Date();
  const eff = effectiveSettings();
  let list;
  if (lockedSlide) {
    const all = buildSlides(eff, data, now);
    list = all.filter((s) => s.id === lockedSlide);
    if (!list.length && all.length) list = [all[0]];
  } else {
    list = buildSlides(eff, data, now);
  }
  if (!list.length) {
    list = [{ id: "blank", label: "—", grid: Array.from({ length: 6 }, () => Array(22).fill(" ")) }];
  }
  slides = list;
  if (idx >= slides.length) idx = 0;
}

function blankGrid() {
  return Array.from({ length: 6 }, () => Array(22).fill(" "));
}

async function show(i, opts = {}) {
  clearTimeout(timer);
  idx = ((i % slides.length) + slides.length) % slides.length;
  await board.show(slides[idx].grid, opts);
  renderDots(dotsEl, slides.length, idx);
  updateStatus();
  scheduleNext();
}

function scheduleNext() {
  clearTimeout(timer);
  if (paused || drawer.isOpen || lockedSlide) return;
  timer = setTimeout(() => show(idx + 1), Math.max(4, settings.dwell) * 1000);
}

function next() { show(idx + 1); }
function prev() { show(idx - 1); }

function togglePause(force) {
  paused = force != null ? force : !paused;
  toast(paused ? "ROTATION PAUSED" : "ROTATION RESUMED");
  if (!paused) scheduleNext();
}

function softRedraw() {
  // refresh current slide content in place (only changed tiles flip)
  rebuild();
  board.show(slides[idx].grid);
  renderDots(dotsEl, slides.length, idx);
}

function updateStatus() {
  const parts = [];
  if (data.weather && data.weather.city) {
    const u = settings.units;
    const t = u === "F" ? Math.round((data.weather.tempC * 9) / 5 + 32) : data.weather.tempC;
    parts.push(`${data.weather.city} ${t}\u00B0${u}`);
  }
  if (data.markets && data.markets.bitcoin) parts.push("BTC " + fmtPrice(data.markets.bitcoin.usd));
  const n = new Date();
  let h = n.getHours();
  let suffix = "";
  if (settings.units === "F") { suffix = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; }
  parts.push(`${String(h).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}${suffix ? " " + suffix : ""}`);
  $("status-right").textContent = parts.join("   \u00B7   ");
  $("status-left").textContent = paused ? "PAUSED" : "FLAPBOARD";
}

/* minute tick: keeps clock/quote/weather slides honest without a full cycle */
let lastMin = -1;
setInterval(() => {
  const n = new Date();
  if (n.getMinutes() === lastMin) return;
  lastMin = n.getMinutes();
  data.quote = quoteForHour(n);
  updateStatus();
  const cur = slides[idx];
  if (cur && ["clock", "weather", "quote", "greeting"].includes(cur.id)) softRedraw();
}, 15000);

setInterval(() => refreshWeather(), 10 * 60 * 1000);
setInterval(() => refreshMarkets(), 5 * 60 * 1000);

/* ---------- controls ---------- */
const drawer = initDrawer(settings, {
  onChange: () => {
    document.body.dataset.theme = settings.theme;
    applySpeed();
    sound.enabled = !!settings.sound;
    rebuild();
    show(idx);
    if (settings.city && settings.city !== lastFetchedCity) refreshWeather();
  },
});

$("btn-prev").onclick = prev;
$("btn-next").onclick = next;

$("btn-sound").onclick = () => {
  settings.sound = !settings.sound;
  sound.enabled = settings.sound;
  $("chk-sound").checked = settings.sound;
  if (settings.sound) sound.click();
  toast(settings.sound ? "SOUND ON" : "SOUND OFF");
};

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
$("btn-full").onclick = toggleFullscreen;
$("board").ondblclick = toggleFullscreen;

window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  switch (e.key) {
    case "ArrowRight": next(); break;
    case "ArrowLeft": prev(); break;
    case " ": e.preventDefault(); togglePause(); break;
    case "f": case "F": toggleFullscreen(); break;
    case "m": case "M": $("btn-sound").click(); break;
    case "s": case "S": drawer.isOpen ? drawer.close() : drawer.open(); break;
    case "Escape": drawer.close(); break;
  }
});

/* idle cursor + chrome hide */
let idleT = null;
function poke() {
  document.body.classList.remove("idle");
  clearTimeout(idleT);
  idleT = setTimeout(() => document.body.classList.add("idle"), 3500);
}
["mousemove", "pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, poke));
poke();

/* ---------- boot ---------- */
(async function boot() {
  rebuild();
  try {
    await board.boot(greetingSlide(new Date(), effectiveSettings()));
  } catch (e) {}
  await show(0);
})();

refreshWeather().then(() => {
  if (settings.city && settings.city !== lastFetchedCity) refreshWeather();
});
refreshMarkets();
