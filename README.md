# FLAPBOARD

Turn any TV, monitor or tablet into a retro **split-flap board** — like an old
airport terminal or a Vestaboard. It runs in the browser: open the URL,
press `F`, done.

**Slides:** clock & date · live weather (Open-Meteo) · quote of the hour ·
crypto markets (CoinGecko) · your own messages. Slides rotate automatically;
only the letters that change actually flip, with real half-flap animation and
mechanical click sound (toggleable).

No build step. No dependencies. No account. No subscription.

---

## Quick start

```bash
node serve.js          # serves on http://localhost:8787
```

Open it, press `F` for fullscreen, press `S` to set your city and messages.
On a TV: open the same URL from the TV's browser (same Wi-Fi), then fullscreen.

## Deploy (pick one)

**Netlify Drop (no CLI):** go to app.netlify.com/drop and drag this folder in.
Live URL in ~10 seconds.

**Vercel:** `npx vercel --prod`

**GitHub Pages:**
```bash
git init -b main && git add -A && git commit -m "flapboard"
# create repo named flapboard on github.com, then:
git remote add origin https://github.com/<you>/flapboard.git
git push -u origin main
# repo Settings → Pages → deploy from branch main
```

Any static host works — it's plain HTML/CSS/JS.

## Keyboard

| Key | Action |
| --- | --- |
| `←` / `→` | previous / next slide |
| `SPACE` | pause / resume rotation |
| `F` | fullscreen |
| `S` | setup drawer |
| `M` | mute / unmute flips |

Double-click the board also toggles fullscreen. Buttons and cursor hide
themselves after 3.5 s of inactivity (display mode).

## URL parameters (session overrides)

| Param | Example | Effect |
| --- | --- | --- |
| `city` | `?city=Copenhagen` | weather city |
| `units` | `?units=C` | metric + 24 h clock (`F` = imperial + AM/PM) |
| `theme` | `?theme=amber` | `classic`, `amber`, `ivory` |
| `msg` | `?msg=HI MOM;BACK SOON` | one or more custom slides (`;` separates slides, `\|` breaks lines) |
| `slide` | `?slide=clock` | show only that slide |
| `lock` | `?lock=weather` | pin one slide forever |
| `speed` | `?speed=slow` | `slow`, `normal`, `fast`, `off` |
| `dwell` | `?dwell=15` | seconds per slide (4–120) |
| `quiet` | `?quiet=1` | force silent |

Example kiosk link:
`https://your-host/?city=Lisbon&units=C&lock=clock&theme=amber&speed=slow`

Settings you change in the drawer persist in `localStorage`; URL params win
for that session only.

## Data sources

- Weather: [open-meteo.com](https://open-meteo.com) — free, no key
- Markets: [coingecko.com](https://coingecko.com) simple price API — free, no key
- Quotes: bundled local pack (rotates hourly)

Everything degrades gracefully offline: last cached weather/markets keep
showing until they expire.

## Files

```
index.html        shell + setup drawer
css/styles.css    themes, tiles, chrome, drawer
js/charset.js     character set + 6×22 grid helpers
js/board.js       split-flap engine (half-flip via Web Animations API)
js/slides.js      slide builders (clock/weather/quote/markets/messages)
js/main.js        loop, keyboard, data refresh, boot sequence
js/weather.js     Open-Meteo geocode + forecast
js/markets.js     CoinGecko prices + 24h change
js/quotes.js      quote pack
js/sound.js       synthesized mechanical clicks (WebAudio)
js/storage.js     settings persistence
serve.js          zero-dep static server
```
