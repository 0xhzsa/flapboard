import { Board } from "./board.js";
import { loadSettings, saveSettings } from "./storage.js";
import { buildSlides, greetingSlide } from "./slides.js";
import { quoteForHour } from "./quotes.js";
import { cachedWeather, getWeather } from "./weather.js";
import { cachedMarkets, fetchMarkets, fmtPrice } from "./markets.js";
import { cachedNews, fetchNews } from "./news.js";
import { cachedSports, fetchSports } from "./sports.js";
import { cachedStatsFor, fetchStats } from "./stats.js";
import { cachedStocks, fetchStocks, demoStocks } from "./stocks.js";
import { cachedCalendarFor, fetchCalendar } from "./calendar.js";
import { cachedAqi, fetchAqi } from "./aqi.js";
import { loadRecipe } from "./recipes.js";
import { initDrawer, renderDots, toast, setWeatherStatus } from "./ui.js";
import { initRemote, initPairing } from "./touch.js";
import { messageSlide } from "./slides.js";
import { sound } from "./sound.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const settings = loadSettings();

/* ---------- session URL overrides (not persisted) ---------- */
if (params.get("city")) settings.city = params.get("city");
if (params.get("theme")) settings.theme = params.get("theme");
if (params.get("units")) settings.units = params.get("units").toUpperCase() === "C" ? "C" : "F";
if (params.get("speed")) settings.speed = params.get("speed");
if (params.get("fit")) settings.flapFit = params.get("fit");
if (params.has("recipe")) {
  settings.recipe = params.get("recipe") || "";
  settings.slides.recipes = true;
}
if (params.get("league")) settings.league = params.get("league");
if (params.get("dwell")) settings.dwell = Math.min(120, Math.max(4, parseInt(params.get("dwell"), 10) || settings.dwell));
if (params.has("quiet")) settings.sound = false;

/* ---------- demo mode (for the landing page embed & tweet) ---------- */
const DEMO = params.has("demo");
// Must be set before any control can fire: initDrawer saves on change, and the
// old code only set this inside onChange, so the first edit leaked into storage.
if (DEMO) window.__NO_SAVE = true;
if (DEMO) {
  settings.city = settings.city || "New York";
  settings.units = "F";
  settings.theme = "classic";
  settings.dwell = 6;
  settings.clean = false; // a demo whose toolbar vanishes looks broken on a phone
  settings.sound = false;
  // A demo defaults to the widest fit, but an explicit ?fit= still wins.
  if (!params.get("fit")) settings.flapFit = "wide";
  Object.assign(settings.slides, {
    clock: true, weather: true, sunmoon: true, quote: true, news: true,
    sports: true, markets: true, stocks: true, stats: false,
    events: true, agenda: true, countdown: true, messages: true,
    recipes: true,
  });
  settings.messages = [
    "WELCOME TO FLAPBOARD|YOUR TV IS THE BOARD",
    "Mo-Fr 07:00-11:00 FRESH COFFEE ALL MORNING",
    "FRIDAY 21:00|DJ NIGHT - FREE ENTRY",
    "QR https://x.com/0xhzsa|FOLLOW THE BUILD",
  ];
}
const lockedSlide = params.has("lock") ? params.get("lock") || "clock" : null;
const REMOTE_MODE = params.has("remote"); // this device is the phone, not a display
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
board.setFlapFit(settings.flapFit);
sound.enabled = !!settings.sound;

/* ---------- data layer ---------- */
const data = {
  weather: null,
  markets: null,
  news: null,
  sports: null,
  stocks: params.has("demo") || settings.slides.stocks ? cachedStocks(settings.stockSymbols) : null,
  stats: settings.statsUrl ? cachedStatsFor(settings.statsUrl) : null,
  calendar: settings.calendarUrl ? cachedCalendarFor(settings.calendarUrl) : null,
  aqi: cachedAqi(),
  nowPlaying: null,
  quote: quoteForHour(),
  recipe: null,
};
{
  const wc = cachedWeather();
  if (wc) data.weather = { ...wc.data };
  data.markets = cachedMarkets();
  data.news = cachedNews();
  data.sports = cachedSports(settings.league);
}

let lastFetchedCity = null;

async function refreshWeather(manual = false) {
  if (!settings.city) {
    setWeatherStatus("No city set — weather slides stay hidden.");
    return;
  }
  setWeatherStatus("Fetching " + settings.city + "...");
  try {
    const w = await getWeather(settings.city);
    data.weather = w;
    lastFetchedCity = settings.city;
    setWeatherStatus(w.city + " · updated " + new Date().toLocaleTimeString());
    // air quality piggybacks on the same location fix
    if (settings.slides.aqi) {
      fetchAqi(w.lat, w.lon).then((a) => { data.aqi = a; softRedraw(); }).catch(() => {});
    }
    softRedraw();
    updateStatus();
  } catch (e) {
    setWeatherStatus("Failed: " + e.message);
    if (manual) toast("WEATHER FAILED");
  }
}

let calBusy = false;
async function refreshCalendar() {
  if (!settings.calendarUrl || !settings.slides.calendar || calBusy) return;
  calBusy = true;
  try {
    data.calendar = await fetchCalendar(settings.calendarUrl);
    softRedraw();
  } catch (e) {} finally { calBusy = false; }
}

let npBusy = false;
async function refreshNowPlaying() {
  if (!settings.nowPlayingUrl || !settings.slides.nowplaying || npBusy) return;
  npBusy = true;
  try {
    const r = await fetch(settings.nowPlayingUrl, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      data.nowPlaying = { title: String(j.title || "").slice(0, 60), artist: String(j.artist || "").slice(0, 22) };
      softRedraw();
    }
  } catch (e) {} finally { npBusy = false; }
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

async function refreshNews() {
  if (!settings.slides.news && !params.has("news")) return;
  try {
    data.news = await fetchNews(3);
    softRedraw();
  } catch (e) {}
}

async function refreshSports(manual = false) {
  if (!settings.slides.sports && !params.has("scores")) return;
  try {
    data.sports = await fetchSports(settings.league || "nba");
    softRedraw();
  } catch (e) {
    if (manual) toast("SCORES FEED FAILED");
  }
}

async function refreshStats() {
  if (!settings.statsUrl || !settings.slides.stats) return;
  try {
    data.stats = await fetchStats(settings.statsUrl);
    softRedraw();
  } catch (e) {}
}

let stocksBusy = false;
async function refreshStocks() {
  if (stocksBusy) return;
  stocksBusy = true;
  try {
    data.stocks = await fetchStocks(settings.stockSymbols, settings.stockFeedUrl);
    softRedraw();
  } catch (e) {
    if (params.has("demo")) {
      data.stocks = demoStocks(); // keep the demo slide alive when feeds are blocked
      softRedraw();
    }
  } finally {
    stocksBusy = false;
  }
}

let recipeBusy = false;
async function refreshRecipes(manual = false) {
  if (recipeBusy) return;
  recipeBusy = true;
  try {
    data.recipe = await loadRecipe(settings.recipe);
    if (manual) toast(`RECIPE: ${String(data.recipe?.name || "").toUpperCase()}`);
    softRedraw();
  } catch (e) {
    toast("RECIPE FETCH FAILED");
  } finally {
    recipeBusy = false;
  }
}

/* ---------- slide loop ---------- */
let slides = [];
let idx = 0;
let timer = null;
let paused = false;
let touch = null; // phone remote pairing API, set up after the controls exist
const dotsEl = $("dots");
const qrOverlay = $("qr-overlay");

function effectiveSettings() {
  const eff = sessionMessages ? { ...settings, messages: sessionMessages, slides: { ...settings.slides, messages: true } } : settings;
  if (params.has("news")) eff.slides = { ...eff.slides, news: true };
  if (params.has("scores")) eff.slides = { ...eff.slides, sports: true };
  return eff;
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

async function show(i, opts = {}) {
  clearTimeout(timer);
  idx = ((i % slides.length) + slides.length) % slides.length;
  const slide = slides[idx];
  window.__slideId = slide.id;
  await board.show(slide.grid, opts);
  renderDots(dotsEl, slides.length, idx);

  // QR overlay handling — generated locally, works fully offline
  const setQr = (url) => {
    if (!url) {
      qrOverlay.hidden = true;
      return;
    }
    const img = qrOverlay.querySelector("img");
    try {
      if (window.qrcode) {
        const qr = window.qrcode(0, "M");
        qr.addData(url);
        qr.make();
        img.src = qr.createDataURL(8, 4); // crisp GIF data-URL, no network
      } else {
        img.src = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&data=" + encodeURIComponent(url);
      }
    } catch (e) {
      img.src = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&data=" + encodeURIComponent(url);
    }
    qrOverlay.hidden = false;
  };

  setQr(slide.overlay || null);
  updateStatus();
  touch?.pushState?.();
  scheduleNext();
}

function scheduleNext() {
  clearTimeout(timer);
  if (paused || drawer.isOpen || lockedSlide) return;
  timer = setTimeout(() => show(idx + 1), Math.max(4, settings.dwell) * 1000);
}

function next() { show(idx + 1); }
function prev() { show(idx - 1); }

function togglePause(force, silent) {
  paused = force != null ? force : !paused;
  if (!silent) toast(paused ? "ROTATION PAUSED" : "ROTATION RESUMED");
  $("status-left").textContent = paused ? "PAUSED" : "FLAPBOARD";
  if (!paused) scheduleNext();
}

/* A message typed on the phone becomes a slide in front of the rotation, then
   hands control back to the board after half a minute. */
let typedTimer = null;
function showTyped(text) {
  const body = text.trim();
  if (!body) return;
  const { grid, overlay } = messageSlide(body);
  const at = slides.findIndex((s) => s.id === "typed");
  if (at >= 0) slides.splice(at, 1);
  slides.unshift({ id: "typed", label: "TYPED", grid, overlay });
  togglePause(true, true);
  show(0);
  clearTimeout(typedTimer);
  typedTimer = setTimeout(() => {
    const now = slides.findIndex((s) => s.id === "typed");
    if (now >= 0) slides.splice(now, 1);
    if (idx >= slides.length) idx = 0;
    togglePause(false, true);
    show(idx);
  }, 30000);
}

/* Flaps tapped on the phone have to survive the 15s time-based redraw, or the
   feature silently undoes itself a second later. Keyed by slide id, so an edit
   sticks to the slide it was made on and not to whatever is on screen now. */
const manualEdits = new Map();

function applyEdits(slide) {
  const edits = manualEdits.get(slide?.id);
  if (!edits) return;
  for (const key of Object.keys(edits)) {
    const [r, c] = key.split(",").map(Number);
    if (slide.grid[r]) slide.grid[r][c] = edits[key];
  }
}

function recordEdit(r, c, ch) {
  const slide = slides[idx];
  if (!slide) return;
  if (!manualEdits.has(slide.id)) manualEdits.set(slide.id, {});
  manualEdits.get(slide.id)[`${r},${c}`] = ch;
  applyEdits(slide);
}

function softRedraw() {
  rebuild();
  const slide = slides[idx];
  applyEdits(slide);
  board.show(slide.grid);
  renderDots(dotsEl, slides.length, idx);
  if (slide.overlay) {
    const img = qrOverlay.querySelector("img");
    try {
      if (window.qrcode) {
        const qr = window.qrcode(0, "M");
        qr.addData(slide.overlay);
        qr.make();
        img.src = qr.createDataURL(8, 4);
      } else {
        img.src = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=2&data=" + encodeURIComponent(slide.overlay);
      }
    } catch (e) {}
    qrOverlay.hidden = false;
  } else {
    qrOverlay.hidden = true;
  }
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
}

/* minute tick keeps time-based slides honest without waiting a full cycle */
let lastMin = -1;
setInterval(() => {
  const n = new Date();
  if (n.getMinutes() === lastMin) return;
  lastMin = n.getMinutes();
  data.quote = quoteForHour(n);
  updateStatus();
  const cur = slides[idx];
  if (cur && ["clock", "weather", "sunmoon", "quote", "message", "qr", "agenda"].includes(cur.id)) softRedraw();
}, 15000);

setInterval(() => refreshWeather(), 10 * 60 * 1000);
setInterval(() => refreshMarkets(), 5 * 60 * 1000);
setInterval(() => refreshRecipes(), 6 * 60 * 60 * 1000);
setInterval(() => refreshNews(), 15 * 60 * 1000);
setInterval(() => refreshSports(), 3 * 60 * 1000);
setInterval(() => refreshStats(), 2 * 60 * 1000);
setInterval(() => refreshStocks(), 3 * 60 * 1000);
setInterval(() => refreshCalendar(), 30 * 60 * 1000);
setInterval(() => refreshNowPlaying(), 90 * 1000);

/* ---------- controls ---------- */
const drawer = initDrawer(settings, {
  onChange: () => {
    document.body.dataset.theme = settings.theme;
    applySpeed();
    board.setFlapFit(settings.flapFit);
    sound.enabled = !!settings.sound;
    rebuild();
    show(idx);
    if (settings.city && settings.city !== lastFetchedCity) refreshWeather();
    if (settings.slides.news) refreshNews();
    if (settings.slides.sports) refreshSports();
    if (settings.slides.stats && settings.statsUrl) refreshStats();
    if (settings.slides.calendar && settings.calendarUrl) refreshCalendar();
    if (settings.slides.nowplaying && settings.nowPlayingUrl) refreshNowPlaying();
    if (settings.slides.recipes) refreshRecipes();
  },
  onRecipe: (pin) => {
    // ANOTHER CAKE clears the pin so the next load rolls a different one
    if (pin === null) {
      settings.recipe = "";
      const inp = document.getElementById("inp-recipe");
      if (inp) inp.value = "";
      saveSettings(settings);
    }
    if (settings.slides.recipes) refreshRecipes(true);
  },
});

/* leaving the demo drops every demo override and starts a clean board */
$("btn-exit-demo").onclick = () => {
  window.location.href = location.pathname;
};
$("btn-exit-demo").hidden = !DEMO;

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
    case "t": case "T": if (touch) touch.open(); break;
    case "Escape": drawer.close(); break;
  }
});

/* idle cursor + chrome hide — clean mode is opt-in, otherwise the toolbar
   disappeared on touch screens where there is no cursor to wake it */
let idleT = null;
function poke() {
  document.body.classList.remove("idle");
  clearTimeout(idleT);
  if (settings.clean) idleT = setTimeout(() => document.body.classList.add("idle"), 3500);
}
["mousemove", "pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, poke));
poke();

/* portrait phones cannot fit 22 columns legibly, so say so instead of
   rendering an unreadable board */
const rotateHint = $("rotate-hint");
function syncRotateHint() {
  if (!rotateHint) return;
  rotateHint.hidden = !(window.innerWidth < 700 && window.innerHeight > window.innerWidth);
}
syncRotateHint();
window.addEventListener("resize", syncRotateHint);
window.addEventListener("orientationchange", syncRotateHint);

/* ---------- boot ---------- */
if (!REMOTE_MODE) {
  (async function boot() {
    rebuild();
    try {
      await board.boot(greetingSlide(new Date()));
    } catch (e) {}
    await show(0);
  })();

  refreshWeather().then(() => {
    if (settings.city && settings.city !== lastFetchedCity) refreshWeather();
  });
  refreshMarkets();
  refreshNews();
  refreshSports();
  refreshStats();
  if (settings.slides.stocks || params.has("demo")) refreshStocks();
  refreshCalendar();
  refreshNowPlaying();
  if (settings.slides.recipes) refreshRecipes();
}

/* ---------- share link (kiosk setup for venues) ---------- */
function buildShareUrl() {
  const p = new URLSearchParams();
  if (settings.city) p.set("city", settings.city);
  if (settings.units) p.set("units", settings.units);
  if (settings.theme !== "classic") p.set("theme", settings.theme);
  if (settings.speed !== "normal") p.set("speed", settings.speed);
  if (settings.flapFit && settings.flapFit !== "standard") p.set("fit", settings.flapFit);
  if (settings.dwell !== 9) p.set("dwell", settings.dwell);
  const msgs = (settings.messages || []).filter(Boolean);
  if (msgs.length) p.set("msg", msgs.join(";"));
  if (settings.slides.recipes) p.set("recipe", settings.recipe || "");
  return location.origin + location.pathname.replace(/(index\.html)?$/, "") + "?" + p.toString();
}
$("btn-share").onclick = async () => {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast("LINK COPIED - OPEN IT ON ANY TV");
  } catch (e) {
    prompt("Copy this link:", url);
  }
};
$("btn-share").hidden = DEMO;

/* ---------- phone as touch screen / keyboard ---------- */
if (REMOTE_MODE) {
  // the phone half never needs a board, so skip the whole display loop
  initRemote();
} else {
  touch = initPairing({
    board,
    onEdit: recordEdit,
    onTyped: showTyped,
    cmds: {
      next,
      prev,
      pause: () => togglePause(),
      sound: () => $("btn-sound").click(),
    },
  });
  $("btn-touch").onclick = () => touch.open();
}
