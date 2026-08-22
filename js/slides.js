import { ROWS, COLS, emptyGrid, centerRow, wrapText, placeCentered, paintRun, messageLines } from "./charset.js";
import { codeText } from "./weather.js";
import { fmtPrice, tickerSymbol } from "./markets.js";

const c = (v) => ({ c: v });

function corners(grid, color = "white") {
  grid[0][0] = c(color);
  grid[0][COLS - 1] = c(color);
  grid[ROWS - 1][0] = c(color);
  grid[ROWS - 1][COLS - 1] = c(color);
}

function topRun(grid, color, count = 4) {
  paintRun(grid, 0, Math.floor((COLS - count) / 2), color.toUpperCase(), count);
}

export function clockSlide(now, settings) {
  const g = emptyGrid();
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const dateLine = `${days[now.getDay()]} ${months[now.getMonth()]} ${now.getDate()}`;

  let h = now.getHours();
  let suffix = "";
  if (settings.units === "F") {
    suffix = h >= 12 ? " PM" : " AM";
    h = h % 12 || 12;
  }
  const time = `${String(h).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}${suffix}`;

  topRun(g, "Y", 4);
  centerRow(g, 1, dateLine);
  centerRow(g, 2, "");
  centerRow(g, 3, time);
  if (settings.city) centerRow(g, 4, settings.city);
  paintRun(g, ROWS - 1, Math.floor((COLS - 4) / 2), "B", 4);
  return g;
}

export function greetingSlide(now, settings) {
  const g = emptyGrid();
  const h = now.getHours();
  const word = h < 5 ? "GOOD NIGHT" : h < 12 ? "GOOD MORNING" : h < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
  corners(g);
  centerRow(g, 1, word);
  centerRow(g, 2, "THE BOARD IS RUNNING");
  centerRow(g, 4, "PRESS S TO SET UP");
  return g;
}

export function weatherSlide(data, settings) {
  const g = emptyGrid();
  topRun(g, "B", 5);
  if (!data) {
    centerRow(g, 1, "WEATHER");
    centerRow(g, 3, settings.city ? "AWAITING DATA" : "SET A CITY IN SETUP");
    return g;
  }
  const u = settings.units;
  const t = (celsius) => (u === "F" ? Math.round((celsius * 9) / 5 + 32) : celsius);
  centerRow(g, 1, (data.city || settings.city || "").slice(0, COLS));
  centerRow(g, 2, (`${t(data.tempC)}${u} ${codeText(data.code)}`).slice(0, COLS));
  centerRow(g, 3, `FEELS ${t(data.feelsC)}${u}`);
  centerRow(g, 4, `HIGH ${t(data.hiC)} LOW ${t(data.loC)}`);
  if (data.tomorrowCode != null) {
    centerRow(g, 5, `TMRW ${codeText(data.tomorrowCode)} ${t(data.tomorrowHiC)}${u}`.slice(0, COLS));
  }
  return g;
}

export function quoteSlide(q) {
  const g = emptyGrid();
  topRun(g, "V", 3);
  const lines = wrapText(q[0], 18).slice(0, 3);
  lines.forEach((l, i) => centerRow(g, i + 1, l));
  centerRow(g, Math.min(ROWS - 1, lines.length + 2), q[1]);
  return g;
}

export function marketsSlide(data) {
  const g = emptyGrid();
  topRun(g, "G", 5);
  centerRow(g, 1, "MARKETS");
  if (!data || !Object.keys(data).length) {
    centerRow(g, 3, "FEED OFFLINE");
    return g;
  }
  const rows = [];
  for (const [id, v] of Object.entries(data)) {
    const sym = tickerSymbol(id);
    const sign = v.chg >= 0 ? "+" : "-";
    rows.push(`${sym} ${fmtPrice(v.usd)} ${sign}${Math.abs(v.chg).toFixed(1)}%`);
  }
  rows.slice(0, 3).forEach((line, i) => centerRow(g, i + 2, line.slice(0, COLS)));
  return g;
}

export function messageSlide(msg) {
  const g = emptyGrid();
  const lines = messageLines(msg);
  placeCentered(g, lines);
  corners(g);
  return g;
}

/** Build the ordered slide list from current settings + data. */
export function buildSlides(settings, data, now = new Date()) {
  const list = [];
  if (settings.slides.clock) list.push({ id: "clock", label: "CLOCK", grid: clockSlide(now, settings) });
  if (settings.slides.weather) list.push({ id: "weather", label: "WEATHER", grid: weatherSlide(data.weather, settings) });
  if (settings.slides.quote) list.push({ id: "quote", label: "QUOTE", grid: quoteSlide(data.quote) });
  if (settings.slides.markets) list.push({ id: "markets", label: "MARKETS", grid: marketsSlide(data.markets) });
  if (settings.slides.messages) {
    for (const m of settings.messages.filter((x) => x && x.trim())) {
      list.push({ id: "message", label: "MESSAGE", grid: messageSlide(m) });
    }
  }
  return list;
}
