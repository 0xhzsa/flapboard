// Stock quotes. Tries Yahoo Finance's public chart endpoint (no key);
// falls back gracefully so the slide never breaks the board.
const CACHE_KEY = "flapboard.stocks";
const TTL = 3 * 60 * 1000;

export function cachedStocks(symbols) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, key, data } = JSON.parse(raw);
    if (Date.now() - at > TTL * 5 || key !== symbols) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export async function fetchStocks(symbolsCsv) {
  const symbols = symbolsCsv.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 4);
  if (!symbols.length) throw new Error("no symbols");
  const out = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`);
        if (!r.ok) throw new Error("http " + r.status);
        const j = await r.json();
        const meta = j.chart?.result?.[0]?.meta;
        if (!meta) throw new Error("bad payload");
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose ?? price;
        const chg = prev ? ((price - prev) / prev) * 100 : 0;
        out[sym] = { price, chg };
      } catch (e) {
        /* symbol failed; leave it out */
      }
    })
  );
  if (!Object.keys(out).length) throw new Error("feed blocked");
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), key: symbolsCsv, data: out }));
  } catch (e) {}
  return out;
}

/** Plausible sample data used in demo mode and when feeds are unreachable. */
export function demoStocks() {
  const seed = Math.floor(Date.now() / 60000); // drifts every minute
  const base = { AAPL: 228, NVDA: 132, MSFT: 421, TSLA: 248 };
  const out = {};
  let i = 0;
  for (const [sym, p] of Object.entries(base)) {
    const wobble = ((seed * 37 + i++ * 91) % 40) / 10 - 2; // -2..+2
    out[sym] = { price: +(p + wobble * (p / 100)).toFixed(2), chg: +wobble.toFixed(2) };
  }
  return out;
}

export function fmtStockPrice(p) {
  return "$" + (p >= 10000 ? (p / 1000).toFixed(1) + "K" : p >= 100 ? p.toFixed(1) : p >= 1 ? p.toFixed(2) : p.toFixed(4));
}
