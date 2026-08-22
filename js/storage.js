const KEY = "flapboard.v1";

export const DEFAULTS = {
  theme: "classic",
  speed: "normal", // slow | normal | fast | off
  dwell: 9,
  sound: true,
  clean: false,
  city: "",
  units: "F",
  coins: "bitcoin,ethereum",
  slides: { clock: true, weather: true, quote: true, markets: true, messages: true },
  messages: ["GOOD MORNING|MAKE TODAY COUNT", "DINNER AT 7|BRING WINE"],
};

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
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    return deepMerge(structuredClone(DEFAULTS), JSON.parse(raw));
  } catch (e) {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    /* storage unavailable */
  }
}
