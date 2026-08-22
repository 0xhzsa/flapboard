// Generic JSON stats feed — point it at anything, including the included
// tools/shopify-stats-server.mjs relay for Shopify sales/revenue.
// Expected JSON: { "title": "TODAY", "rows": [["SALES","$1,204"],["ORDERS","38"]] }
const CACHE_KEY = "flapboard.stats";
const TTL = 2 * 60 * 1000;

export function cachedStatsFor(url) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, url: u, data } = JSON.parse(raw);
    if (Date.now() - at > TTL * 5 || u !== url) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export async function fetchStats(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("stats failed");
  const j = await r.json();
  const data = {
    title: String(j.title || "STATS").toUpperCase(),
    rows: (Array.isArray(j.rows) ? j.rows : [])
      .slice(0, 4)
      .map((row) => [String(row[0]).toUpperCase(), String(row[1])]),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), url, data }));
  } catch (e) {}
  return data;
}
