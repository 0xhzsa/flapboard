// Live sports scores via ESPN's public scoreboard API (no key).
// league: nfl | nba | mlb | nhl | epl
const CACHE_KEY = "flapboard.sports";
const TTL = 3 * 60 * 1000;

export function cachedSports(league) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, key, data } = JSON.parse(raw);
    if (Date.now() - at > TTL * 5 || key !== league) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export async function fetchSports(league) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath(league)}/scoreboard`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("scores failed");
  const j = await r.json();
  const games = [];
  for (const ev of (j.events || []).slice(0, 4)) {
    try {
      const comp = ev.competitions[0];
      const home = comp.competitors.find((x) => x.homeAway === "home");
      const away = comp.competitors.find((x) => x.homeAway === "away");
      const status = ev.status?.type?.shortDetail || "";
      games.push({
        away: away.team.abbreviation,
        home: home.team.abbreviation,
        as: away.score ?? "",
        hs: home.score ?? "",
        state: ev.status?.type?.state, // pre | in | post
        detail: status.replace(/^[A-Z]{2,} /, "").slice(0, 10),
      });
    } catch (e) {}
  }
  const data = { league, games, updated: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), key: league, data }));
  } catch (e) {}
  return data;
}

function sportPath(league) {
  switch ((league || "").toLowerCase()) {
    case "nfl": return "football/nfl";
    case "nba": return "basketball/nba";
    case "mlb": return "baseball/mlb";
    case "nhl": return "hockey/nhl";
    case "epl": return "soccer/eng.1";
    case "boxing": return "boxing";
    case "mma": return "mma";
    default: return "basketball/nba";
  }
}

export function formatGame(g) {
  if (g.state === "pre") return `${g.away} AT ${g.home}`;
  return `${g.away} ${g.as}-${g.hs} ${g.home}`.slice(0, 22);
}
