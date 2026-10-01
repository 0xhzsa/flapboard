// Cake recipes, on demand.
//
// TheMealDB is free, needs no key and sends CORS headers, so the board can ask
// it directly. Like every other feed here it caches in localStorage and keeps
// showing the last good answer when the network or the CORS policy says no.
//
// A 6x22 board cannot hold a recipe, so a recipe becomes several slides: the
// name, the ingredients, the method in steps, then a QR for the full thing.

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

/** Every cake TheMealDB knows about. */
export async function fetchCakeList() {
  const j = await getJSON(`${API}/search.php?s=cake`);
  const meals = Array.isArray(j.meals) ? j.meals : [];
  if (!meals.length) throw new Error("no cakes");
  const list = meals.map((m) => ({ id: m.idMeal, name: m.strMeal }));
  writeCache(LIST_KEY, list);
  return list;
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
 * `pin` is a recipe name or id; without one, pick a random cake so the board
 * changes from visit to visit.
 */
export async function loadRecipe(pin) {
  const want = String(pin || "").trim().toLowerCase();
  if (/^\d+$/.test(want)) {
    try {
      return await fetchRecipe(want);
    } catch {
      /* fall through to the search path */
    }
  }

  const list = cachedRecipeList() || (await fetchCakeList().catch(() => null));
  if (!list || !list.length) return FALLBACK[0];

  let pick = null;
  if (want) pick = list.find((c) => c.name.toLowerCase().includes(want));
  // the cake list is only cakes, so a pin like "brownies" needs its own search
  if (!pick && want) {
    try {
      const hits = await searchRecipes(want);
      pick = hits.find((c) => c.name.toLowerCase().includes(want)) || hits[0] || null;
    } catch {}
  }
  if (!pick) pick = list[Math.floor(Math.random() * list.length)];

  try {
    return await fetchRecipe(pick.id);
  } catch {
    const c = cachedRecipe(pick.id);
    if (c) return c;
    return FALLBACK.find((f) => f.name.toLowerCase().includes(want)) || FALLBACK[0];
  }
}

/* ---------- board formatting ---------- */

/** "175g/6oz" -> "175G". The board has no room for both. */
export function shortMeasure(measure) {
  let first = String(measure || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  // "225 g" -> "225G" reads compact, but "1 CAN" must keep its space
  first = first.replace(/\s+(\S{1,2})(?=\s|$)/g, "$1");
  // drop trailing units until the measure fits a board column
  const parts = first.split(" ");
  while (parts.length > 1 && parts.join(" ").length > 10) parts.pop();
  first = parts.join(" ");
  // "1 1/2 CUPS" is fine, but "225G/450G" needs one side only
  if (first.length > 12 && first.includes("/")) first = first.split("/")[0].trim();
  return first || "1";
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

/* Kept for when TheMealDB is unreachable or blocked by CORS. Real bakes with
   ordinary quantities, so a kitchen board is never empty. */
const FALLBACK = [
  {
    id: "fb-victoria",
    name: "Victoria Sponge",
    area: "British",
    tags: ["Sandwich", "Baking"],
    ingredients: [
      { measure: "225g", name: "butter, softened" },
      { measure: "225g", name: "caster sugar" },
      { measure: "4", name: "large eggs" },
      { measure: "225g", name: "self-raising flour" },
      { measure: "1tsp", name: "baking powder" },
      { measure: "", name: "jam and cream" },
    ],
    instructions: [
      "Line two 20cm tins and heat the oven to 180C fan.",
      "Cream the butter and sugar until pale, then beat in the eggs one at a time.",
      "Fold in the flour with the baking powder and a pinch of salt.",
      "Split between the tins, bake 22 minutes until springy.",
      "Cool, then sandwich with jam and a thick layer of cream.",
    ],
    url: "https://www.theguardian.com/food/2020/may/11/how-to-make-the-perfect-victoria-sponge-recipe",
  },
  {
    id: "fb-carrot",
    name: "Carrot Cake",
    area: "British",
    tags: ["Cake", "Spiced"],
    ingredients: [
      { measure: "250ml", name: "vegetable oil" },
      { measure: "250g", name: "light brown sugar" },
      { measure: "4", name: "large eggs" },
      { measure: "200g", name: "plain flour" },
      { measure: "2tsp", name: "baking powder" },
      { measure: "300g", name: "carrots, grated" },
      { measure: "200g", name: "cream cheese" },
      { measure: "", name: "walnuts" },
    ],
    instructions: [
      "Heat the oven to 170C fan and line three 20cm tins.",
      "Whisk the oil, sugar and eggs together until smooth.",
      "Fold in the flour, baking powder and grated carrot.",
      "Bake 25 minutes each, cool completely in the tins.",
      "Spread the cream cheese icing and scatter the walnuts.",
    ],
    url: "https://www.bbcgoodfood.com/recipes/carrot-cake",
  },
];