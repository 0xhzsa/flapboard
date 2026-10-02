// Unit conversion, cake curation and recipe slide shape.
// Pure functions, no browser and no network: node tools/qa-units.mjs
import {
  convertMeasure,
  convertOvenTemp,
  detectGear,
  realCakes,
  loadRecipe,
  pretty,
  shortMeasure,
  ovenPair,
  FALLBACK,
} from "../app/js/recipes.js";
import { recipeSlides } from "../app/js/slides.js";
import { ROWS, COLS } from "../app/js/charset.js";

let fails = 0;
const results = [];
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
};
const eq = (label, got, want) => check(label, String(got) === String(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const flat = (grid) => grid.map((r) => r.map((c) => (c && typeof c === "object" ? (c.c ?? "?") : c)).join(""));
const header = (grid) => flat(grid)[0];
const bodyText = (grid) => flat(grid).slice(1, -1).join("\n");

/* ---------------- fractions ---------------- */
eq("pretty snaps to whole", pretty(7.94), "8");
eq("pretty keeps a real fraction", pretty(0.5), "1/2");
eq("pretty separates the whole part", pretty(7.875), "7 7/8");
eq("pretty can never read as 77/8", !pretty(7.875).includes("77/8"), true);
eq("pretty(1.5)", pretty(1.5), "1 1/2");

/* ---------------- metric ---------------- */
for (const [m, want] of [
  ["1/2 cup", "120ML"],
  ["450ml vegetable oil", "450 ML"],
  ["1 lb flour", "454G"],
  ["8 oz chocolate", "227G"],
  ["1 stick butter", "113G"],
  ["2 tsp baking powder", "10ML"],
  ["1 tbsp vanilla", "15ML"],
  ["1 1/2 cups sugar", "360ML"],
  ["225g caster sugar", "225G"],
  ["4 large eggs", "4"],
  ["1 pinch of salt", "1 PINCH"],
  ["to taste", "TO TASTE"],
  ["", ""],
]) eq(`metric ${JSON.stringify(m)}`, convertMeasure(m, "metric"), want);

/* ---------------- us ---------------- */
for (const [m, want] of [
  ["225g caster sugar", "8 OZ"],
  ["454g flour", "1 LB"],
  ["120ml milk", "1/2 CUP"],
  ["15ml vanilla", "1 TBSP"],
  ["5ml baking powder", "1 TSP"],
  ["1/2 cup cocoa", "1/2 CUP"],
  ["4 eggs", "4"],
]) eq(`us ${JSON.stringify(m)}`, convertMeasure(m, "us"), want);

/* ---------------- unicode fractions from the API ---------------- */
// a 5ml spoon is the smallest measure worth putting on the board
eq("½ tsp is understood", convertMeasure("½ tsp salt", "metric"), "5ML");
eq("¼ cup is understood", convertMeasure("¼ cup cocoa", "metric"), "60ML");
eq("½ stays out of the charset", /[^\x20-\x7E]/.test(shortMeasure("½ cup")), false);
eq("1½ becomes 1 1/2", shortMeasure("1½ cups"), "1 1/2 CUPS");

/* ---------------- oven temperatures ---------------- */
eq("metric 180C stays", convertOvenTemp("heat the oven to 180C", "metric"), "heat the oven to 180C");
eq("metric 350F becomes 180C", convertOvenTemp("bake at 350F for 20 mins", "metric"), "bake at 180C for 20 mins");
eq("us 350F stays", convertOvenTemp("bake at 350F", "us"), "bake at 350F");
eq("us 180C gets both", convertOvenTemp("oven to 180C", "us"), "oven to 180C / 355F");
eq("no duplicated conversion", convertOvenTemp("160C/325F/GAS 3", "metric"), "160C/GAS 3");
eq("no duplicated conversion in us", convertOvenTemp("160C/325F/GAS 3", "us"), "160C/325F/GAS 3");
eq("160C is 320F, not 325F", ovenPair(160, "C"), "160C / 320F");
eq("180C is 355F", ovenPair(180, "C"), "180C / 355F");

/* ---------------- gear ---------------- */
const gear = detectGear(["Line two 20cm tins and heat the oven to 180C.", "Sieve the flour.", "Chill overnight in the fridge."]);
check("gear finds the oven", gear.some((g) => g.includes("OVEN")), gear.join(" | "));
check("gear finds the tin", gear.includes("A TIN OR PAN"), gear.join(" | "));
check("gear finds the sieve", gear.includes("SIEVE"), gear.join(" | "));
check("gear finds the fridge", gear.includes("FRIDGE SPACE"), gear.join(" | "));
eq("gear stays quiet when there is nothing to say", detectGear(["Stir it all together."]).length, 0);

/* ---------------- curation ---------------- */
const sample = [
  "Apple cake", "Banana Pancakes", "Battenberg Cake", "Beetroot pancakes", "Blini Pancakes",
  "Carrot Cake", "Mini bundt cakes", "Pancakes", "New York cheesecake", "Provençal Omelette Cake",
  "Oatmeal pancakes", "Salted Caramel Cheescake",
].map((n, i) => ({ id: String(i), name: n }));
const kept = realCakes(sample).map((c) => c.name);
check("pancakes are dropped", !kept.some((n) => /pancake/i.test(n)), kept.join(", "));
check("the omelette impostor is dropped", !kept.includes("Provençal Omelette Cake"), kept.join(", "));
check("bundt is not mistaken for a bun", kept.includes("Mini bundt cakes"), kept.join(", "));
check("cheesecake survives", kept.includes("New York cheesecake"), kept.join(", "));
check("plain cake survives", kept.includes("Carrot Cake"), kept.join(", "));

/* ---------------- never repeat, never change mid-read ---------------- */
const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.reject(new Error("offline"));
const seen = [];
for (let i = 0; i < 8; i++) seen.push((await loadRecipe("", { avoid: seen[i - 1] || "" })).id);
check("the previous cake is never repeated", seen.every((id, i) => id !== seen[i - 1]), seen.join(" -> "));
check("offline still shows a cake", seen.every((id) => FALLBACK.some((f) => f.id === id)), seen.join(" -> "));

const pinned = FALLBACK[1].id;
const twice1 = await loadRecipe(pinned);
const twice2 = await loadRecipe(pinned);
check("a pin always returns the same cake", twice1.id === twice2.id && twice1.name === twice2.name, `${twice1.id} vs ${twice2.id}`);
globalThis.fetch = realFetch;

/* ---------------- slide shape ---------------- */
const meal = {
  name: "Test Cake",
  area: "British",
  tags: ["Cake"],
  ingredients: [
    { measure: "225g", name: "butter" },
    { measure: "½ cup", name: "caster sugar" },
    { measure: "4", name: "large eggs" },
    { measure: "1 lb", name: "self-raising flour" },
    { measure: "1 pinch", name: "salt" },
  ],
  instructions: [
    "Heat the oven to 180C and line two 20cm tins.",
    "Cream the butter and sugar until pale and fluffy.",
    "Beat in the eggs one at a time.",
    "Fold in the flour and a pinch of salt.",
    "Bake for 22 minutes until golden.",
  ],
};
const slides = recipeSlides(meal, { units: "metric" });
const ids = slides.map((s) => s.id);

check("every slide fits the board", slides.every((s) => s.grid.length === ROWS && s.grid.every((r) => r.length === COLS)));
check("every slide has a dwell", slides.every((s) => typeof s.dwell === "number" && s.dwell >= 6), JSON.stringify(slides.map((s) => s.dwell)));
check("the recipe opens with what you need", ids[0] === "recipe-gear", ids.join(", "));
check("the title comes next", ids[1] === "recipe", ids.join(", "));
check("shopping is there", ids.includes("recipe-buy"));
check("method is there", ids.includes("recipe-method"));
check("the run ends on the QR", ids[ids.length - 1] === "recipe-qr", ids.join(", "));

// one step per slide, numbered, and the last one says how many there are
const steps = slides.filter((s) => s.id === "recipe-method");
const stepHeads = steps.map((s) => header(s.grid));
check("each step slide names its step", stepHeads.every((h) => /STEP \d+ OF 5( CONT \d+\/\d+)?/.test(h)), stepHeads.join(" | "));
check("step numbering starts at 1", /STEP 1 OF 5/.test(stepHeads[0]), stepHeads[0]);
const stepNums = [...new Set(stepHeads.map((h) => h.match(/STEP (\d+) OF/)[1]))];
check("every step is shown once", stepNums.join(",") === "1,2,3,4,5", stepNums.join(","));
// continuation slides must not swallow any of the wording
const words = (s) =>
  s.grid
    .slice(1, -1)
    .flat()
    .map((c) => (c && typeof c === "object" ? c.c ?? " " : c))
    .join("")
    .replace(/[^A-Z0-9]/g, "");
const said = steps.map((s) => words(s).replace(/^\d+/, "")).join("");
eq("the method says everything the recipe says", said, meal.instructions.join("").toUpperCase().replace(/[^A-Z0-9]/g, ""));

// reading time scales with the step
const long = slides.find((s) => /STEP 2 OF 5/.test(header(s.grid)));
const short = slides.find((s) => /STEP 5 OF 5/.test(header(s.grid)));
check("a longer step stays on screen longer", long.dwell >= short.dwell, `${long.dwell} vs ${short.dwell}`);

// quantities converted, ingredients intact
const buyText = slides.filter((s) => s.id === "recipe-buy").map((s) => bodyText(s.grid)).join("\n");
check("metric quantities on the shopping list", /454G/.test(buyText), buyText);
check("nothing unprintable reached the board", !/[^\x20-\x7E]/.test(slides.map((s) => flat(s.grid).join("")).join("").replace(/\n/g, "")));
check("oven temperature shown both ways", /180C \/ 355F/.test(bodyText(slides[0].grid)), bodyText(slides[0].grid));
check("corner markers survive the long footer", String(slides[1].grid[ROWS - 1][0]) !== " " && String(slides[1].grid[ROWS - 1][COLS - 1]) !== " ");

const usText = recipeSlides(meal, { units: "us" }).filter((s) => s.id === "recipe-buy").map((s) => bodyText(s.grid)).join("\n");
check("US cook gets ounces and pounds", /1 LB/.test(usText) && /8 OZ/.test(usText), usText);
const rawText = recipeSlides(meal, { units: "as-written" }).filter((s) => s.id === "recipe-buy").map((s) => bodyText(s.grid)).join("\n");
check("as-written leaves quantities alone", /225G/.test(rawText), rawText);

console.log(results.join("\n"));
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);