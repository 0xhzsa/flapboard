const CACHE_KEY = "flapboard.weather";
const TTL = 10 * 60 * 1000; // 10 minutes

export function cachedWeather() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > TTL * 4) return null; // stale beyond 40 min: drop
    return { at, data };
  } catch (e) {
    return null;
  }
}

function persist(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch (e) {}
}

export async function geocode(name) {
  const url = "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" + encodeURIComponent(name);
  const r = await fetch(url);
  if (!r.ok) throw new Error("geocode failed");
  const j = await r.json();
  const hit = j.results && j.results[0];
  if (!hit) throw new Error("city not found");
  return { lat: hit.latitude, lon: hit.longitude, label: hit.name.toUpperCase(), tz: hit.timezone };
}

const WMO = {
  0: "CLEAR", 1: "MOSTLY CLEAR", 2: "PARTLY CLOUDY", 3: "OVERCAST",
  45: "FOG", 48: "FOG",
  51: "DRIZZLE", 53: "DRIZZLE", 55: "DRIZZLE",
  56: "ICY DRIZZLE", 57: "ICY DRIZZLE",
  61: "LIGHT RAIN", 63: "RAIN", 65: "HEAVY RAIN",
  66: "FREEZING RAIN", 67: "FREEZING RAIN",
  71: "LIGHT SNOW", 73: "SNOW", 75: "HEAVY SNOW", 77: "SNOW",
  80: "SHOWERS", 81: "SHOWERS", 82: "HEAVY SHOWERS",
  85: "SNOW SHOWERS", 86: "SNOW SHOWERS",
  95: "THUNDERSTORM", 96: "T-STORM + HAIL", 99: "T-STORM + HAIL",
};

export function codeText(code) {
  return WMO[code] || "CHANGEABLE";
}

export async function fetchWeather(lat, lon) {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=" + lat +
    "&longitude=" + lon +
    "&current=temperature_2m,apparent_temperature,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
    "&forecast_days=2&timezone=auto";
  const r = await fetch(url);
  if (!r.ok) throw new Error("forecast failed");
  const j = await r.json();
  const data = {
    tempC: Math.round(j.current.temperature_2m),
    feelsC: Math.round(j.current.apparent_temperature),
    code: j.current.weather_code,
    hiC: Math.round(j.daily.temperature_2m_max[0]),
    loC: Math.round(j.daily.temperature_2m_min[0]),
    tomorrowCode: j.daily.weather_code[1],
    tomorrowHiC: Math.round(j.daily.temperature_2m_max[1]),
    fetchedAt: Date.now(),
  };
  persist(data);
  return data;
}

export async function getWeather(city) {
  const geo = await geocode(city);
  const data = await fetchWeather(geo.lat, geo.lon);
  return { ...data, city: geo.label };
}
