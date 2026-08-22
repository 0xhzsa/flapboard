// Air quality via Open-Meteo (free, no key, CORS ok).
const CACHE_KEY = "flapboard.aqi";
const TTL = 30 * 60 * 1000;

export function cachedAqi() {
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

export async function fetchAqi(lat, lon) {
  const url =
    "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + lat +
    "&longitude=" + lon + "&current=us_aqi&timezone=auto";
  const r = await fetch(url);
  if (!r.ok) throw new Error("aqi failed");
  const j = await r.json();
  const aqi = Math.round(j.current.us_aqi);
  let word = "GOOD", color = "G";
  if (aqi > 300) { word = "HAZARDOUS"; color = "V"; }
  else if (aqi > 200) { word = "VERY UNHEALTHY"; color = "R"; }
  else if (aqi > 150) { word = "UNHEALTHY"; color = "O"; }
  else if (aqi > 100) { word = "SENSITIVE"; color = "Y"; }
  else if (aqi > 50) { word = "MODERATE"; color = "Y"; }
  const data = { aqi, word, color, fetchedAt: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch (e) {}
  return data;
}
