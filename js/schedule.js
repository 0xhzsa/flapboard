import { ROWS, COLS, emptyGrid, centerRow, wrapText, placeCentered, paintRun, stamp, corners } from "./charset.js";
import { codeText, moonPhase } from "./weather.js";
import { fmtPrice, tickerSymbol } from "./markets.js";
import { spriteForCode, SPRITES } from "./icons.js";

/* ---------------- schedule (dayparting) for messages ----------------
   Syntax:  [Mo-Fr] [07:00-11:00] MESSAGE TEXT
   e.g. "Mo-Fr 07:00-11:00 FRESH CROISSANTS EVERY MORNING"
        "17:00-20:00 HAPPY HOUR IS ON"
        "plain message shows always"
--------------------------------------------------------------------- */
const DAY_CODES = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
const SCHED_RE = /^(?:(su|mo|tu|we|th|fr|sa)(?:-(su|mo|tu|we|th|fr|sa))?\s+)?(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+)$/i;

export function parseSchedule(raw) {
  const m = String(raw).match(SCHED_RE);
  if (!m) return { text: String(raw).trim(), days: null, start: null, end: null };
  let days = null;
  if (m[1]) {
    const a = DAY_CODES[m[1].toLowerCase()];
    const b = m[2] ? DAY_CODES[m[2].toLowerCase()] : a;
    days = [];
    if (a <= b) for (let d = a; d <= b; d++) days.push(d);
    else for (let d = a; d !== (b + 1) % 7; d = (d + 1) % 7) days.push(d);
  }
  return {
    days,
    start: (+m[3]) * 60 + +m[4],
    end: (+m[5]) * 60 + +m[6],
    text: m[7].trim(),
  };
}

export function isMessageActive(raw, now = new Date()) {
  const s = parseSchedule(raw);
  if (s.start == null) return true;
  if (s.days && !s.days.includes(now.getDay())) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  if (s.start <= s.end) return t >= s.start && t < s.end;
  return t >= s.start || t < s.end; // overnight window
}

export function isQrMessage(raw) {
  return /^qr\s+\S+/i.test(String(raw).trim());
}
