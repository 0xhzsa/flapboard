// Minimal iCal (.ics) reader for the Calendar slide.
// Google Calendar secret-iCal URLs allow browser CORS; other servers may not.

const CAL_KEY = "flapboard.cal";
const TTL = 30 * 60 * 1000;

export function cachedCalendarFor(url) {
  try {
    const raw = localStorage.getItem(CAL_KEY);
    if (!raw) return null;
    const { at, url: u, data } = JSON.parse(raw);
    if (Date.now() - at > TTL * 4 || u !== url) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function unfold(text) {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function parseWhen(v) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const hh = +(m[4] || 0), mi = +(m[5] || 0);
  if (/Z$/.test(v)) return new Date(Date.UTC(y, mo, d, hh, mi));
  return new Date(y, mo, d, hh, mi);
}

export function parseIcs(text) {
  const lines = unfold(text);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      cur = {};
    } else if (line.startsWith("END:VEVENT")) {
      if (cur && cur.start && cur.title) events.push(cur);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).toUpperCase();
      const val = line.slice(idx + 1).trim();
      if (key.startsWith("DTSTART")) cur.start = parseWhen(val);
      else if (key.startsWith("SUMMARY")) cur.title = val.replace(/\\,/g, ",").replace(/\\;/g, ";");
    }
  }
  return events;
}

export async function fetchCalendar(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("calendar http " + r.status);
  const text = await r.text();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const horizon = new Date(todayStart.getTime() + 7 * 86400000);
  const upcoming = parseIcs(text)
    .filter((e) => e.start >= todayStart && e.start <= horizon)
    .sort((a, b) => a.start - b.start)
    .slice(0, 6)
    .map((e) => {
      const sameDay = e.start.toDateString() === now.toDateString();
      const hhmm = String(e.start.getHours()).padStart(2, "0") + ":" + String(e.start.getMinutes()).padStart(2, "0");
      const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      return {
        when: sameDay ? hhmm : dayNames[e.start.getDay()] + " " + e.start.getDate(),
        title: String(e.title).toUpperCase().slice(0, 16),
        ts: e.start.getTime(),
      };
    });
  try {
    localStorage.setItem(CAL_KEY, JSON.stringify({ at: Date.now(), url, data: upcoming }));
  } catch (e) {}
  return upcoming;
}
