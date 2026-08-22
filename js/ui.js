import { saveSettings } from "./storage.js";

const $ = (id) => document.getElementById(id);

export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove("show"), 2200);
}

export function renderDots(el, count, active) {
  el.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const d = document.createElement("i");
    if (i === active) d.className = "on";
    el.appendChild(d);
  }
}

export function setWeatherStatus(text) {
  $("weather-status").textContent = text || "";
}

/** Wire every control in the drawer to the settings object. */
export function initDrawer(settings, { onChange, onGeolocate }) {
  const bind = (fn) => () => {
    fn();
    saveSettings(settings);
    onChange();
  };

  // display
  const theme = $("sel-theme");
  const speed = $("sel-speed");
  const dwell = $("inp-dwell");
  const soundChk = $("chk-sound");
  const clean = $("chk-clean");

  theme.value = settings.theme;
  speed.value = settings.speed;
  dwell.value = settings.dwell;
  soundChk.checked = !!settings.sound;
  clean.checked = !!settings.clean;

  theme.onchange = bind(() => (settings.theme = theme.value));
  speed.onchange = bind(() => (settings.speed = speed.value));
  dwell.onchange = bind(() => (settings.dwell = Math.min(120, Math.max(4, parseInt(dwell.value, 10) || 9))));
  soundChk.onchange = bind(() => (settings.sound = soundChk.checked));
  clean.onchange = bind(() => (settings.clean = clean.checked));

  // weather
  const city = $("inp-city");
  const units = $("sel-units");
  city.value = settings.city;
  units.value = settings.units;
  city.onchange = bind(() => (settings.city = city.value.trim()));
  units.onchange = bind(() => (settings.units = units.value));
  $("btn-geo").onclick = () => {
    if (!navigator.geolocation) return toast("GEOLOCATION UNAVAILABLE");
    toast("LOCATING...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`);
          const j = await r.json();
          settings.city = (j.city || j.locality || j.principalSubdivision || "").trim();
        } catch (e) {
          settings.city = "";
        }
        if (!settings.city) {
          settings.city = pos.coords.latitude.toFixed(2) + "," + pos.coords.longitude.toFixed(2);
        }
        city.value = settings.city;
        saveSettings(settings);
        onChange();
        toast("LOCATION SET: " + settings.city.toUpperCase());
      },
      () => toast("LOCATION DENIED"),
      { timeout: 8000 }
    );
  };

  // slides
  const map = { "chk-clock": "clock", "chk-weather": "weather", "chk-quote": "quote", "chk-markets": "markets", "chk-messages": "messages" };
  for (const [id, key] of Object.entries(map)) {
    const el = $(id);
    el.checked = !!settings.slides[key];
    el.onchange = bind(() => (settings.slides[key] = el.checked));
  }

  const msgs = $("txt-messages");
  msgs.value = settings.messages.join("\n");
  msgs.onchange = bind(() => {
    settings.messages = msgs.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
  });

  const coins = $("inp-coins");
  coins.value = settings.coins;
  coins.onchange = bind(() => (settings.coins = coins.value.trim() || "bitcoin"));

  // open / close
  const drawer = $("drawer");
  const open = () => {
    drawer.hidden = false;
  };
  const close = () => {
    drawer.hidden = true;
  };
  $("btn-setup").onclick = open;
  $("btn-close").onclick = close;
  $("btn-done").onclick = close;

  return { open, close, get isOpen() { return !drawer.hidden; } };
}
