const CACHE_KEY = "flapboard.markets";
const TTL = 5 * 60 * 1000;

export function cachedMarkets() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > TTL * 6) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Fetch spot prices + 24h change from CoinGecko (free, no key).
 * ids: comma list like "bitcoin,ethereum"
 */
export async function fetchMarkets(ids) {
  const clean = ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  if (!clean.length) throw new Error("no ids");
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=" +
    encodeURIComponent(clean.join(",")) +
    "&vs_currencies=usd&include_24hr_change=true";
  const r = await fetch(url);
  if (!r.ok) throw new Error("markets failed");
  const j = await r.json();
  const out = {};
  for (const id of Object.keys(j)) {
    out[id] = { usd: j[id].usd, chg: j[id].usd_24h_change ?? 0 };
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: out }));
  } catch (e) {}
  return out;
}

export function fmtPrice(usd) {
  if (usd >= 10000) {
    const k = usd / 1000;
    return "$" + k.toFixed(1) + "K";
  }
  if (usd >= 1000) return "$" + Math.round(usd).toLocaleString("en-US");
  if (usd >= 10) return "$" + usd.toFixed(2);
  if (usd >= 1) return "$" + usd.toFixed(3);
  return "$" + usd.toFixed(4);
}

export function tickerSymbol(id) {
  const map = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL", cardano: "ADA", dogecoin: "DOGE", ripple: "XRP", litecoin: "LTC", polkadot: "DOT", chainlink: "LINK", avalanche: "AVAX" };
  return map[id] || id.slice(0, 4).toUpperCase();
}
