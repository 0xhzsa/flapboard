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
  slides: {
    clock: true,
    weather: true,
    sunmoon: true,
    quote: true,
    news: false,
    sports: false,
    markets: true,
    agenda: true,
    countdown: true,
    messages: true,
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
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {}
}
