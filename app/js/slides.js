import { ROWS, COLS, emptyGrid, centerRow, wrapText, placeCentered, paintRun, stamp, corners } from "./charset.js";
import { codeText, moonPhase } from "./weather.js";
import { fmtPrice, tickerSymbol } from "./markets.js";
import { fmtStockPrice } from "./stocks.js";
import { spriteForCode, SPRITES } from "./icons.js";
import { parseSchedule, isMessageActive, isQrMessage } from "./schedule.js";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

export function clockSlide(now, settings) {
  const g = emptyGrid();
  const dateLine = `${DAYS[now.getDay()]} ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  let h = now.getHours();
  let suffix = "";
  if (settings.units === "F") {
    suffix = h >= 12 ? " PM" : " AM";
    h = h % 12 || 12;
  }
  const time = `${String(h).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}${suffix}`;

  paintRun(g, 0, Math.floor((COLS - 5) / 2), "Y", 5);
  centerRow(g, 1, dateLine);
  centerRow(g, 3, time);
  if (settings.city) centerRow(g, 4, settings.city.slice(0, COLS));
  paintRun(g, ROWS - 1, Math.floor((COLS - 5) / 2), "B", 5);
  return g;
}

export function greetingSlide(now) {
  const g = emptyGrid();
  const h = now.getHours();
  const word = h < 5 ? "GOOD NIGHT" : h < 12 ? "GOOD MORNING" : h < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
  corners(g, "Y");
  centerRow(g, 1, word);
  centerRow(g, 2, "THE BOARD IS RUNNING");
  centerRow(g, 4, "PRESS S TO SET UP");
  return g;
}

function tempStr(celsius, units) {
  return units === "F" ? `${Math.round((celsius * 9) / 5 + 32)}F` : `${celsius}C`;
}

export function weatherSlide(data, settings) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 6) / 2), "B", 6);
  if (!data) {
    centerRow(g, 1, "WEATHER");
    centerRow(g, 3, settings.city ? "AWAITING DATA" : "SET A CITY IN SETUP");
    return g;
  }
  centerRow(g, 1, (data.city || "").slice(0, COLS));

  const SHORTEN = { "PARTLY CLOUDY": "P.CLOUDY", "MOSTLY SUNNY": "M.SUNNY", "CLEAR SKIES": "CLEAR", "LIGHT RAIN": "LT RAIN", "HEAVY RAIN": "HVY RAIN", "LIGHT SNOW": "LT SNOW", "HEAVY SNOW": "HVY SNOW", "HEAVY SHOWERS": "SHOWERS", "SNOW SHOWERS": "SNOWSHWR", "FREEZING FOG": "FRZ FOG", "ICY DRIZZLE": "IC DRIZZLE", "T-STORM HAIL": "T-STORM", "CHANGEABLE": "MIXED" };
  const cond = SHORTEN[codeText(data.code)] || codeText(data.code);
  stamp(g, 3, 1, spriteForCode(data.code));

  // right-hand stat column next to the icon
  const put = (row, text) => {
    const t = text.toUpperCase().slice(0, COLS - 11);
    for (let i = 0; i < t.length; i++) grid_set(g, row, 10 + i, t[i]);
  };
  put(3, tempStr(data.tempC, settings.units));
  put(4, cond.slice(0, 11));
  put(5, `H${tempStr(data.hiC, settings.units).replace(/F|C$/, "")} L${tempStr(data.loC, settings.units)}`);
  return g;
}
function grid_set(g, r, c, ch) {
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = ch;
}

export function sunMoonSlide(data) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 6) / 2), "Y", 3);
  paintRun(g, 0, Math.floor((COLS - 6) / 2) + 3, "V", 3);
  centerRow(g, 1, "SUN & MOON");
  if (!data || !data.sunrise) {
    centerRow(g, 3, "AWAITING DATA");
    return g;
  }
  const fmt = (hhmm) => (hhmm.length === 4 ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : hhmm);
  centerRow(g, 3, `RISE ${fmt(data.sunrise)}   SET ${fmt(data.sunset)}`);
  centerRow(g, 4, moonPhase(new Date()));
  return g;
}

export function quoteSlide(q) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 3) / 2), "V", 3);
  const lines = wrapText(q[0], 18).slice(0, 3);
  lines.forEach((l, i) => centerRow(g, i + 1, l));
  centerRow(g, Math.min(ROWS - 1, lines.length + 2), q[1]);
  return g;
}

export function newsSlide(title) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 4) / 2), "O", 4);
  centerRow(g, 1, "HEADLINES");
  const lines = wrapText(title, 20).slice(0, 4);
  const start = Math.max(1, Math.floor((ROWS - lines.length) / 2));
  lines.forEach((l, i) => centerRow(g, start + i, l));
  return g;
}

export function marketsSlide(data) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 5) / 2), "G", 5);
  centerRow(g, 1, "MARKETS");
  if (!data || !Object.keys(data).length) {
    centerRow(g, 3, "FEED OFFLINE");
    return g;
  }
  const rows = [];
  for (const [id, v] of Object.entries(data)) {
    const sign = v.chg >= 0 ? "+" : "-";
    rows.push(`${tickerSymbol(id)} ${fmtPrice(v.usd)} ${sign}${Math.abs(v.chg).toFixed(1)}%`);
  }
  rows.slice(0, 4).forEach((line, i) => centerRow(g, i + 2, line.slice(0, COLS)));
  return g;
}

export function sportsSlide(sportsData) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 4) / 2), "G", 4);
  centerRow(g, 1, (sportsData?.league || "SCORES").toUpperCase());
  if (!sportsData || !sportsData.games.length) {
    centerRow(g, 3, "NO GAMES TODAY");
    return g;
  }
  sportsData.games.slice(0, 4).forEach((game, i) => {
    let line;
    if (game.state === "pre") line = `${game.away} AT ${game.home}`.slice(0, COLS);
    else line = `${game.away} ${game.as}-${game.hs} ${game.home}`.slice(0, COLS);
    centerRow(g, i + 2, line);
  });
  return g;
}

export function countdownSlide(countdowns) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 5) / 2), "O", 5);
  centerRow(g, 1, "COUNTDOWN");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items = countdowns
    .map((cd) => {
      const target = new Date(cd.date + "T00:00:00");
      const days = Math.round((target - today) / 86400000);
      return { label: String(cd.label || "EVENT").toUpperCase(), days };
    })
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 2);
  if (!items.length) {
    centerRow(g, 3, "NOTHING SCHEDULED");
    return g;
  }
  items.forEach((it, i) => {
    const txt = it.days === 0 ? `${it.label}: TODAY` : `${it.label} IN ${it.days} DAYS`;
    centerRow(g, 2 + i * 2, txt.slice(0, COLS));
  });
  return g;
}

export function agendaSlide(items) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 5) / 2), "G", 5);
  centerRow(g, 1, "TODAY");
  const list = items.slice(0, 4);
  if (!list.length) {
    centerRow(g, 3, "NOTHING PLANNED");
    return g;
  }
  list.forEach((line, i) => centerRow(g, i + 2, line.toUpperCase().slice(0, COLS)));
  return g;
}

/** Message slide. Returns {grid, overlay?}. Supports "QR https://... | CAPTION". */
export function messageSlide(raw) {
  const s = parseSchedule(raw);
  const body = s.text;
  const g = emptyGrid();
  const qrMatch = body.match(/^qr\s+(\S+)\s*(?:\|\s*(.*))?$/i);

  if (qrMatch) {
    const caption = qrMatch[2] ? wrapText(qrMatch[2], COLS).slice(0, 1) : [];
    centerRow(g, 0, caption[0] || "");
    centerRow(g, ROWS - 1, "SCAN WITH YOUR PHONE");
    corners(g, "B");
    return { grid: g, overlay: qrMatch[1].trim() };
  }

  const lines = body.split("|").flatMap((p) => wrapText(p.trim(), COLS)).slice(0, 4);
  placeCentered(g, lines);
  corners(g, "W");
  return { grid: g, overlay: null };
}

export function stocksSlide(stocksData) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 6) / 2), "G", 6);
  centerRow(g, 1, "STOCKS");
  if (!stocksData || !Object.keys(stocksData).length) {
    centerRow(g, 3, "FEED OFFLINE");
    return g;
  }
  Object.entries(stocksData).slice(0, 4).forEach(([sym, v], i) => {
    const sign = v.chg >= 0 ? "+" : "-";
    centerRow(g, i + 2, `${sym} ${fmtStockPrice(v.price)} ${sign}${Math.abs(v.chg).toFixed(1)}%`.slice(0, COLS));
  });
  return g;
}

/** Upcoming events: fights, DJ sets, quiz nights. Lines: "YYYY-MM-DD TITLE" (date optional). */
export function eventsSlide(items, now = new Date()) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 6) / 2), "R", 3);
  paintRun(g, 0, Math.floor((COLS - 6) / 2) + 3, "K", 3);
  centerRow(g, 1, "WHAT'S ON");
  const parsed = items
    .map((line) => {
      const m = String(line).match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      return m ? { date: m[1], text: m[2] } : { date: null, text: line };
    })
    .filter((e) => !e.date || new Date(e.date + "T23:59:59") >= now)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
    .slice(0, 3);
  if (!parsed.length) {
    centerRow(g, 3, "NOTHING ANNOUNCED");
    return g;
  }
  parsed.forEach((e, i) => {
    let label = e.text.toUpperCase();
    if (e.date) {
      const d = new Date(e.date + "T12:00:00");
      const diff = Math.round((new Date(e.date + "T00:00:00") - new Date(now.toDateString())) / 86400000);
      const when = diff === 0 ? "TONIGHT" : diff === 1 ? "TOMORROW" : `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()}`;
      label = `${when} ${label}`.slice(0, COLS);
    }
    centerRow(g, i + 2, label);
  });
  return g;
}

export function statsSlide(statsData) {
  const g = emptyGrid();
  paintRun(g, 0, Math.floor((COLS - 5) / 2), "G", 5);
  if (!statsData || !statsData.rows || !statsData.rows.length) {
    centerRow(g, 1, "STATS");
    centerRow(g, 3, "FEED OFFLINE");
    return g;
  }
  centerRow(g, 1, String(statsData.title || "STATS").slice(0, COLS));
  statsData.rows.slice(0, 4).forEach((row, i) => {
    const label = String(row[0] || "").toUpperCase();
    const value = String(row[1] ?? "");
    const line = `${label} ${value}`.trim().slice(0, COLS);
    centerRow(g, i + 2, line);
  });
  return g;
}

/** Build the ordered slide list from current settings + live data. */
export function buildSlides(settings, data, now = new Date()) {
  const list = [];
  const S = settings.slides || {};
  if (S.clock) list.push({ id: "clock", label: "CLOCK", grid: clockSlide(now, settings) });
  if (S.weather) list.push({ id: "weather", label: "WEATHER", grid: weatherSlide(data.weather, settings) });
  if (S.sunmoon && data.weather) list.push({ id: "sunmoon", label: "SKY", grid: sunMoonSlide(data.weather) });
  if (S.quote) list.push({ id: "quote", label: "QUOTE", grid: quoteSlide(data.quote) });
  if (S.news && Array.isArray(data.news)) {
    for (const t of data.news.slice(0, 2)) list.push({ id: "news", label: "NEWS", grid: newsSlide(t) });
  }
  if (S.sports && data.sports) list.push({ id: "sports", label: "SCORES", grid: sportsSlide(data.sports) });
  if (S.markets) list.push({ id: "markets", label: "MARKETS", grid: marketsSlide(data.markets) });
  if (S.stocks) list.push({ id: "stocks", label: "STOCKS", grid: stocksSlide(data.stocks) });
  if (S.events && Array.isArray(settings.events) && settings.events.length) {
    list.push({ id: "events", label: "EVENTS", grid: eventsSlide(settings.events, now) });
  }
  if (S.stats && data.stats && settings.statsUrl) {
    list.push({ id: "stats", label: "STATS", grid: statsSlide(data.stats) });
  }
  if (S.agenda && Array.isArray(settings.agenda) && settings.agenda.length) {
    list.push({ id: "agenda", label: "TODAY", grid: agendaSlide(settings.agenda) });
  }
  if (S.countdown && Array.isArray(settings.countdowns) && settings.countdowns.length) {
    list.push({ id: "countdown", label: "COUNTDOWN", grid: countdownSlide(settings.countdowns) });
  }
  if (S.messages) {
    for (const m of (settings.messages || []).filter((x) => x && x.trim())) {
      if (!isMessageActive(m, now)) continue;
      const { grid, overlay } = messageSlide(m);
      list.push(isQrMessage(m) ? { id: "qr", label: "QR", grid, overlay } : { id: "message", label: "MESSAGE", grid });
    }
  }
  return list;
}
