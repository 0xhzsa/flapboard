// Hacker News top stories — free, no key, CORS enabled.
const CACHE_KEY = "flapboard.news";
const TTL = 15 * 60 * 1000;

export function cachedNews() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > TTL * 4) return null;
    return data;
  } catch (e) {
    return null;
  }
}

async function item(id) {
  const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
  if (!r.ok) throw new Error("hn item failed");
  return r.json();
}

export async function fetchNews(count = 3) {
  const r = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
  if (!r.ok) throw new Error("hn failed");
  const ids = (await r.json()).slice(0, 12);
  const picked = [];
  for (const id of ids) {
    try {
      const it = await item(id);
      if (it && it.title && !it.url?.includes("pdf")) picked.push(it.title);
    } catch (e) {}
    if (picked.length >= count * 2) break;
  }
  // prefer shorter, board-friendly titles
  const short = picked.filter((t) => t.length <= 90).slice(0, count);
  const out = short.length ? short : picked.slice(0, count);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: out }));
  } catch (e) {}
  return out;
}
