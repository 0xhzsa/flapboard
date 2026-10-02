// Cake recipes, on demand.
//
// TheMealDB is free, needs no key and sends CORS headers, so the board can ask
// it directly. Like every other feed here it caches in localStorage and keeps
// showing the last good answer when the network or the CORS policy says no.
//
// A 6x22 board cannot hold a recipe, so a recipe becomes a short run of slides:
// what to grab first, the shopping list, one step per slide, then a QR.
//
// Two things matter more than the API. A person stands in a kitchen aisle and
// reads this, so quantities are converted to whatever units they cook in and
// the oven temperature is spelled out both ways. And the board must never swap
// the cake while someone is halfway through it.

const API = "https://www.themealdb.com/api/json/v1/1";
const LIST_KEY = "flapboard.recipes.list";
const MEAL_KEY = "flapboard.recipes.meal";
const LIST_TTL = 24 * 60 * 60 * 1000;
const MEAL_TTL = 7 * 24 * 60 * 60 * 1000;

const readCache = (key, ttl) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > ttl) return null;
    return data;
  } catch {
    return null;
  }
};

const writeCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {}
};

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}

export function cachedRecipeList() {
  return readCache(LIST_KEY, LIST_TTL);
}
export function cachedRecipe(id) {
  const c = readCache(MEAL_KEY, MEAL_TTL);
  return c && c.id === id ? c.meal : null;
}

/* ---------- choosing a cake worth baking ---------- */

// "s=cake" also returns pancakes, crepes and an omelette. Nobody wants a
// split-flap board to suggest beetroot pancakes.
const NOT_A_CAKE =
  /\b(pancakes?|blini|crepes?|breads?|buns?|muffins?|scones?|waffles?|doughnuts?|donuts?|biscuits?|fritters?|cookies?|omelette)\b/i;
const IS_A_CAKE = /cake|brownie|tart|gateau|flan|trifle|cupcake|pudding/i;

/** Drop the savoury impostors, keep the things people actually want to bake. */
export function realCakes(list) {
  return (list || []).filter((c) => !NOT_A_CAKE.test(c.name) && IS_A_CAKE.test(c.name));
}

/** Every cake TheMealDB knows about, minus the impostors. */
export async function fetchCakeList() {
  const j = await getJSON(`${API}/search.php?s=cake`);
  const meals = Array.isArray(j.meals) ? j.meals : [];
  if (!meals.length) throw new Error("no cakes");
  const all = meals.map((m) => ({ id: m.idMeal, name: m.strMeal }));
  const list = realCakes(all);
  writeCache(LIST_KEY, list.length ? list : all);
  return list.length ? list : all;
}

/** Any dish by name, so a pin like "brownies" is not limited to cakes. */
export async function searchRecipes(term) {
  const j = await getJSON(`${API}/search.php?s=${encodeURIComponent(term)}`);
  const meals = Array.isArray(j.meals) ? j.meals : [];
  return meals.map((m) => ({ id: m.idMeal, name: m.strMeal }));
}

/** One recipe in full: ingredients, quantities, method. */
export async function fetchRecipe(id) {
  const j = await getJSON(`${API}/lookup.php?i=${encodeURIComponent(id)}`);
  const m = Array.isArray(j.meals) ? j.meals[0] : null;
  if (!m) throw new Error("no such recipe");
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = m[`strIngredient${i}`];
    if (!name || !name.trim()) continue;
    ingredients.push({ measure: (m[`strMeasure${i}`] || "").trim(), name: name.trim() });
  }
  const meal = {
    id: m.idMeal,
    name: m.strMeal || "Cake",
    area: m.strArea || "",
    tags: (m.strTags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3),
    ingredients,
    instructions: String(m.strInstructions || "")
      .split(/\r?\n|(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12),
    url: m.strSource || m.strYoutube || `https://www.themealdb.com/#${m.idMeal}`,
  };
  writeCache(MEAL_KEY, { id: meal.id, meal });
  return meal;
}

/**
 * Resolve the recipe the board should show.
 * `pin` is a recipe name or id. Without one, pick a cake that is not the one
 * from last time — but if the id is given, return exactly that, because
 * nobody wants the board changing the cake halfway through a bake.
 */
export async function loadRecipe(pin, { avoid = "" } = {}) {
  const want = String(pin || "").trim().toLowerCase();
  if (want && /^\d+$/.test(want)) {
    try {
      return await fetchRecipe(want);
    } catch {
      /* fall through to the search path */
    }
  }

  // an older cache was built before the pancakes were filtered out, so filter again
  const list = realCakes(cachedRecipeList() || (await fetchCakeList().catch(() => null)));
  if (!list || !list.length) return FALLBACK.find((f) => f.id !== avoid) || FALLBACK[0];

  let pick = null;
  if (want) pick = list.find((c) => c.name.toLowerCase().includes(want));
  // the cake list is only cakes, so a pin like "brownies" needs its own search
  if (!pick && want) {
    try {
      const hits = realCakes(await searchRecipes(want));
      pick = hits.find((c) => c.name.toLowerCase().includes(want)) || hits[0] || null;
    } catch {}
  }
  if (!pick) {
    const fresh = list.filter((c) => c.id !== avoid);
    pick = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length || list.length))];
  }

  try {
    return await fetchRecipe(pick.id);
  } catch {
    const c = cachedRecipe(pick.id);
    if (c) return c;
    return FALLBACK.find((f) => f.name.toLowerCase().includes(want)) || FALLBACK[0];
  }
}

/* ---------- units, because this gets read in an aisle ---------- */

const ML = { cup: 240, cups: 240, tbsp: 15, tbspn: 15, tablespoon: 15, tablespoons: 15, tsp: 5, tspn: 5, teaspoon: 5, teaspoons: 5, ml: 1, floz: 29.57 };
const GRAMS = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6, stick: 113 };

// words that are part of a quantity; anything else belongs to the ingredient
const UNIT_WORDS = new Set([
  "cup", "cups", "tbsp", "tbspn", "tbspns", "tablespoon", "tablespoons", "tsp", "tspn", "tspns",
  "teaspoon", "teaspoons", "ml", "millilitre", "milliliter", "millilitres", "milliliters",
  "l", "litre", "litres", "liter", "liters", "fl", "floz", "quart", "quarts", "pint", "pints",
  "g", "gram", "grams", "gm", "kg", "kilogram", "kilograms", "oz", "ounce", "ounces",
  "lb", "lbs", "pound", "pounds", "stick", "sticks", "clove", "cloves", "can", "cans", "tin",
  "tins", "packet", "pack", "pinch", "pinches", "dash", "dashes", "splash", "sprig", "sprigs",
  "bunch", "head", "handful", "slice", "slices", "gallon", "gallons",
]);

/** TheMealDB writes "½ tsp" and "1 tbsp", so unicode fractions have to go first. */
const UNICODE_FRACTIONS = {
  "¼": "1/4", "½": "1/2", "¾": "3/4",
  "⅐": "1/7", "⅑": "1/9", "⅒": "1/10",
  "⅓": "1/3", "⅔": "2/3", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

const normalizeMeasure = (s) =>
  String(s || "")
    .replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => " " + UNICODE_FRACTIONS[c] + " ")
    .replace(/\s+/g, " ")
    .trim();

const tidy = (n, step) => {
  const r = Math.round(n / step) * step;
  return r >= 100 ? String(Math.round(r)) : String(Math.round(r * 10) / 10);
};

const EIGHTHS = [[0.125, "1/8"], [0.25, "1/4"], [0.333, "1/3"], [0.375, "3/8"], [0.5, "1/2"], [0.625, "5/8"], [0.666, "2/3"], [0.75, "3/4"], [0.875, "7/8"], [1, ""]];

/**
 * Snap a number to the nearest kitchen fraction.
 * The board charset has no glyph for 1/2, so fractions stay as 1/2, and a whole
 * part needs a space so 7 7/8 can never read as 77/8.
 */
export function pretty(n) {
  let best = { d: Infinity, text: String(Math.round(n * 100) / 100) };
  for (let w = Math.floor(n) - 1; w <= Math.floor(n) + 1; w++) {
    for (const [v, lbl] of EIGHTHS) {
      // a whole number wins a near miss against an awkward fraction
      const d = Math.abs(w + v - n) * (lbl ? 1.06 : 1);
      if (d >= best.d) continue;
      best = { d, text: lbl ? (w > 0 ? `${w} ${lbl}` : lbl) : String(w + v) };
    }
  }
  return best.text || String(Math.round(n));
}

/** Split "1 1/2 cups" into 1.5 and "cups". */
function parseQty(measure) {
  const m = normalizeMeasure(measure).match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s*(.*)$/);
  if (!m) return null;
  let n;
  if (m[1].includes(" ")) {
    const [w, f] = m[1].split(" ");
    n = Number(w) + Number(f.split("/")[0]) / Number(f.split("/")[1]);
  } else if (m[1].includes("/")) {
    const [a, b] = m[1].split("/");
    n = Number(a) / Number(b);
  } else {
    n = Number(m[1]);
  }
  return Number.isFinite(n) ? { n, rest: m[2].trim() } : null;
}

/** "1 lb flour" -> "lb". "1 fl oz water" -> "floz". */
function unitOf(rest) {
  const toks = String(rest || "").toLowerCase().split(/[\s.]+/).filter(Boolean);
  if (!toks.length) return "";
  if (toks[0] === "fl") return "floz";
  return toks[0];
}

/**
 * Rewrite a quantity into the reader's units.
 * "1/2 cup" -> "120ML", "225g" -> "8 OZ" for a US cook.
 * Anything we do not understand is left exactly as written.
 */
export function convertMeasure(measure, system = "metric") {
  const raw = String(measure || "").trim();
  if (!raw) return "";
  if (system === "as-written") return shortMeasure(raw);
  const q = parseQty(raw);
  if (!q) return shortMeasure(raw);
  const unit = unitOf(q.rest);
  const already = ["g", "gram", "grams", "gm", "kg", "kilogram", "kilograms", "ml"].includes(unit);

  if (system === "metric") {
    if (already) return shortMeasure(raw);
    if (unit in ML) return `${tidy(q.n * ML[unit], 5)}ML`;
    if (unit in GRAMS) {
      const g = q.n * GRAMS[unit];
      return `${tidy(g, g >= 1000 ? 25 : 1)}G`;
    }
    return shortMeasure(raw);
  }

  // US cook, possibly from a metric or imperial source
  const cups = (ml) => `${pretty(ml / 240)}${ml / 240 > 1.2 ? " CUPS" : " CUP"}`;
  // past about three quarters of a pound, pounds are how it is sold and measured
  const usWeight = (g) => {
    const lb = g / 453.6;
    return lb >= 0.75 ? `${pretty(lb)} LB` : `${pretty(g / 28.35)} OZ`;
  };
  if (unit === "g" || unit === "gram" || unit === "grams" || unit === "gm" || unit === "kg" || unit === "kilogram" || unit === "kilograms") {
    return usWeight(unit.startsWith("k") ? q.n * 1000 : q.n);
  }
  if (unit === "ml" || unit === "millilitre" || unit === "milliliter" || unit === "millilitres" || unit === "milliliters") {
    if (q.n >= 100) return cups(q.n);
    if (q.n >= 12) return `${pretty(q.n / 15)} TBSP`;
    return `${pretty(q.n / 5)} TSP`;
  }
  if (unit === "l" || unit === "litre" || unit === "litres" || unit === "liter" || unit === "liters") return cups(q.n * 1000);
  if (unit in GRAMS) return usWeight(q.n * GRAMS[unit]);
  if (unit in ML) {
    const ml = q.n * ML[unit];
    if (ml >= 100) return cups(ml);
    if (ml >= 12) return `${pretty(ml / 15)} TBSP`;
    return `${pretty(ml / 5)} TSP`;
  }
  return shortMeasure(raw);
}

/** Oven temperatures land on the grid people actually cook on. */
const round10 = (n) => Math.round(n / 10) * 10;
// 180C is 356F; snapping to 25 would claim 355 and turn a correct 320F into 325
const round5 = (n) => Math.round(n / 5) * 5;

/** Both sides of the conversion, because ovens disagree. */
export function ovenPair(n, unit) {
  const c = unit.toUpperCase() === "F" ? round10((Number(n) - 32) * 0.5556) : Number(n);
  const f = unit.toUpperCase() === "F" ? Number(n) : round5(Number(n) * 1.8 + 32);
  return `${c}C / ${f}F`;
}

/** Oven temperatures in the prose, in the reader's units. */
export function convertOvenTemp(text, system = "metric") {
  let out = String(text);
  out = out.replace(/(\d{3})\s*°?\s*(?:degrees\s*)?F\b/gi, (_, n) =>
    system === "us" ? `${n}F` : `${Math.round(((Number(n) - 32) * 0.5556) / 10) * 10}C`
  );
  // a source that already carries both scales needs no second opinion
  const hadF = /\d{3}\s*°?\s*(?:degrees\s*)?F\b/i.test(out);
  out = out.replace(/(\d{3})\s*°?\s*(?:degrees\s*)?C\b/gi, (_, n) =>
    system === "us" && hadF ? `${n}C` : system === "us" ? ovenPair(n, "C") : `${n}C`
  );
  // "160C/325F" becomes "160C/160C" once converted, so fold the duplicate away
  return out.replace(/(\d{3}C)(\s*[\/&]\s*)\1/g, "$1");
}

/** What you need standing there before the first step, worked out from the method. */
export function detectGear(instructions) {
  const text = (instructions || []).join(" ");
  const found = [];
  const has = (re, label) => {
    if (re.test(text) && !found.includes(label)) found.push(label);
  };
  // "180C", "350F", "180 degrees" and "gas 3" are all how recipes write an oven
  const cands = [
    ...[...text.matchAll(/(\d{3})\s*°?\s*(?:degrees?\s*)?([CF])\b/gi)].map((m) => ovenPair(m[1], m[2])),
    ...[...text.matchAll(/(\d{3})\s*(?:degrees?|deg\b)/gi)].map((m) => ovenPair(m[1], "C")),
  ];
  const gas = text.match(/\bgas\s*(?:mark\s*)?([1-9])\b/i);
  if (cands.length) found.push(`OVEN ${[...new Set(cands)].slice(0, 2).join(" OR ")}`);
  else if (gas) found.push(`OVEN GAS ${gas[1]}`);
  else has(/\b(oven|pre-?heat|bake|roast)\b/i, "PREHEAT THE OVEN");
  has(/\b(springform|cake ?tins?|loaf ?tin|round ?tin|square ?tin|tins?|pans?|tray|baking ?sheet)\b/i, "A TIN OR PAN");
  has(/\b(mixer|whisk|electric)\b/i, "MIXER OR WHISK");
  has(/\b(sieve|strainer)\b/i, "SIEVE");
  has(/\b(scales?|weighing)\b/i, "KITCHEN SCALES");
  has(/\b(cooling rack|wire rack)\b/i, "COOLING RACK");
  has(/\b(fridge|refrigerator|chill|overnight)\b/i, "FRIDGE SPACE");
  has(/\b(baking (paper|parchment)|greaseproof)\b/i, "BAKING PAPER");
  has(/\b(rolling pin)\b/i, "ROLLING PIN");
  has(/\b(blender|food processor)\b/i, "BLENDER");
  return found.slice(0, 5);
}

/** The quantity on its own: "4 large eggs" -> "4", "1 1/2 cups" -> "1 1/2 CUPS". */
export function shortMeasure(measure) {
  const raw = normalizeMeasure(measure).toUpperCase();
  if (!raw) return "";
  const q = parseQty(raw);
  if (!q) return raw.slice(0, 12); // "TO TASTE"
  const keep = [];
  for (const w of q.rest.split(" ")) {
    const k = w.replace(/[^A-Z]/g, "");
    if (!k) continue;
    if (!UNIT_WORDS.has(k.toLowerCase())) break;
    keep.push(k);
  }
  let out = `${pretty(q.n)} ${keep.join(" ")}`.trim();
  // a one-letter unit reads better tight against the number
  out = out.replace(/^(\S+) ([A-Z])$/, "$1$2");
  return out.slice(0, 12);
}

/** Ingredients arrive as prose. The board needs an ingredient. */
export function shortIngredient(name) {
  return String(name)
    .toUpperCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(FREE-RANGE|ORGANIC|FRESH|CHOPPED|ROASTED|PLAIN|GRATED|MELTED|SOFTENED|BONELESS|SKINLESS)\b/g, "")
    .replace(/[,;].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const FALLBACK = [
  {
    id: "fallback-victoria",
    name: "Victoria Sponge",
    area: "British",
    tags: ["Cake"],
    ingredients: [
      { measure: "225G", name: "butter" },
      { measure: "225G", name: "caster sugar" },
      { measure: "4", name: "large eggs" },
      { measure: "225G", name: "self-raising flour" },
      { measure: "1TSP", name: "baking powder" },
      { measure: "", name: "jam and cream" },
    ],
    instructions: [
      "Line two 20cm tins and heat the oven to 180C.",
      "Cream the butter and sugar until pale, then beat in the eggs one at a time.",
      "Fold in the flour with the baking powder and a pinch of salt.",
      "Split between the tins and bake for 22 minutes.",
      "Cool, then sandwich with jam and cream.",
    ],
    url: "https://www.themealdb.com/meal/52792",
  },
  {
    id: "fallback-carrot",
    name: "Carrot Cake",
    area: "British",
    tags: ["Cake"],
    ingredients: [
      { measure: "250ML", name: "vegetable oil" },
      { measure: "250G", name: "plain flour" },
      { measure: "1TSP", name: "baking powder" },
      { measure: "300G", name: "caster sugar" },
      { measure: "3", name: "eggs" },
      { measure: "400G", name: "carrots, grated" },
      { measure: "2TBSP", name: "ground cinnamon" },
    ],
    instructions: [
      "Heat the oven to 180C and line two 20cm round tins.",
      "Whisk the oil, sugar and eggs together until thick.",
      "Fold in the flour, baking powder, carrots and cinnamon.",
      "Bake for 40 minutes until a skewer comes out clean.",
      "Cool completely before icing.",
    ],
    url: "https://www.themealdb.com/meal/52772",
  },
];