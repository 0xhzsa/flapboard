const KEY = "flapboard.v2";

export const DEFAULTS = {
  theme: "classic",
  speed: "normal", // slow | normal | fast | off
  dwell: 9,
  sound: true,
  clean: false,
  city: "",
  units: "F",
  coins: "bitcoin,ethereum",
  league: "nba",
  statsUrl: "",
  stockSymbols: "AAPL,NVDA,MSFT,TSLA",
  stockFeedUrl: "",
  calendarUrl: "",
  nowPlayingUrl: "",
  flights: [
    "07:25|LONDON|BA842|ON TIME",
    "08:10|PARIS|AF1516|BOARDING",
    "09:45|NEW YORK|KL622|DELAYED",
    "11:30|TOKYO|JL432|ON TIME",
  ],
  events: [
    "2026-09-12 TITLE FIGHT NIGHT",
    "2026-09-19 DJ MARCO ALL NIGHT",
    "FRIDAYS QUIZ + WINGS",
  ],
  slides: {
    clock: true,
    weather: true,
    sunmoon: true,
    aqi: true,
    quote: true,
    news: false,
    sports: false,
    markets: true,
    stocks: false,
    stats: false,
    events: true,
    agenda: true,
    countdown: true,
    messages: true,
    calendar: false,
    nowplaying: false,
    departures: false,
  },
  countdowns: [{ label: "SUMMER", date: nextSummer() }],
  agenda: ["08:00 COFFEE FIRST", "09:30 STANDUP", "18:00 GYM"],
  messages: [
    "GOOD MORNING|MAKE TODAY COUNT",
    "Mo-Fr 07:00-11:00 FRESH CROISSANTS ALL MORNING",
  ],
};

function nextSummer() {
  const now = new Date();
  let y = now.getFullYear();
  if (now > new Date(y, 5, 21)) y++;
  return `${y}-06-21`;
}

function deepMerge(base, over) {
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") {
      deepMerge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

export function loadSettings() {
  try {
    // migrate v1 settings if present
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      const old = localStorage.getItem("flapboard.v1");
      if (old) raw = old;
    }
    if (!raw) return structuredClone(DEFAULTS);
    return deepMerge(structuredClone(DEFAULTS), JSON.parse(raw));
  } catch (e) {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  if (typeof window !== "undefined" && window.__NO_SAVE) return; // demo mode: session-only
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {}
}
