# FLAPBOARD

Turn any TV, monitor or tablet into a retro **split-flap board** — like an old
airport terminal or a Vestaboard. It runs in the browser: open the URL,
press `F`, done. Inspired by Solari departure boards; not affiliated with
Vestaboard, Inc.

**Slides:** clock & date · live weather and air quality (Open-Meteo) · sunrise
& moon phase · quote of the hour · crypto markets (CoinGecko) · stock quotes ·
headlines · sports scores · events · agenda · countdowns · QR menus · and a full
airport departures board. Slides rotate automatically; only the letters that
change actually flip, with real half-flap animation and mechanical click sound
(toggleable).

Your own text is the point of the thing: messages can be scheduled, so
`07:00-11:00 FRESH CROISSANTS` only shows during the morning.

A phone on the same Wi-Fi can become the touch screen and keyboard: scan a QR
code, tap a flap to change that letter, type a message to write it across the
whole board.

No build step. No dependencies. No account. Free and open source.

---

## Quick start

```bash
node serve.js          # serves on http://localhost:8787
```

Open it, press `F` for fullscreen, press `S` to set your city and messages.
On a TV: open the same URL from the TV's browser (same Wi-Fi), then fullscreen.

## Phone as touch screen

One extra command, on any machine already on the same network as the TV and the
phone:

```bash
node tools/touch-relay.mjs
```

It serves the app and prints a network address. Open that address on the TV,
press `TOUCH`, and scan the QR code with any phone camera. The phone then
mirrors the board: tap a flap to change that letter, or type a message to write
it across the whole board.

The TV does the flipping, so the animation and the sound stay on the TV. Nothing
is sent anywhere except your own network: the relay only routes between the two
devices, and it dies when you stop it.

If you open the app on `localhost` the phone cannot reach it, so the TOUCH
panel says so rather than showing a QR code that would not work.

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
| `T` | open the phone pairing panel |

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
| `fit` | `?fit=wide` | how tightly the letters fill each flap: `compact`, `standard`, `wide` |
| `dwell` | `?dwell=15` | seconds per slide (4–120) |
| `quiet` | `?quiet=1` | force silent |
| `demo` | `?demo=1` | preset showreel, changes are not saved |
| `recipe` | `?recipe=carrot cake` | show that dish (turns the recipe rotation on); blank picks a new one each load |
| `remote` | `?remote#K7QP` | this device is the phone, paired to room `K7QP` |

Example kiosk link:
`https://your-host/?city=Lisbon&units=C&lock=clock&theme=amber&speed=slow`

Settings you change in the drawer persist in `localStorage`; URL params win
for that session only.

## Data sources

- Weather: [open-meteo.com](https://open-meteo.com) — free, no key
- Markets: [coingecko.com](https://coingecko.com) simple price API — free, no key
- Recipes: [themealdb.com](https://www.themealdb.com) free test key `1`, no signup
- Quotes: bundled local pack (rotates hourly)

Everything degrades gracefully offline: last cached weather/markets keep
showing until they expire.

## Files

```
index.html           landing page (its hero runs the real board engine)
assets/landing.css   landing design system
assets/landing.js    landing hero: mounts the real Board + real slide builders
app/index.html       the display app: stage, setup drawer, touch/remote panels
app/css/styles.css   themes, flap tiles, chrome, drawer, phone remote
app/js/board.js      split-flap engine, letter fit, snapshot, nudge
app/js/slides.js     every slide builder
app/js/main.js       boot, rotation loop, keyboard, data refresh
app/js/charset.js    character set + 6x22 grid helpers
app/js/weather.js    Open-Meteo geocode + forecast
app/js/markets.js    CoinGecko prices + 24h change
app/js/stocks.js     Yahoo quotes, with a demo fallback
app/js/aqi.js        air quality
app/js/news.js       headlines
app/js/sports.js     scores
app/js/schedule.js   time- and day-windowed messages
app/js/icons.js      sprite sheets for weather/icons
app/js/calendar.js   ICS events
app/js/stats.js      your own JSON stats feed
app/js/recipes.js    TheMealDB client, cache, bundled fallback cakes
app/js/quotes.js     quote pack
app/js/sound.js      synthesized mechanical clicks (WebAudio)
app/js/storage.js    settings persistence
app/js/ui.js         setup drawer controls
app/js/touch.js      phone remote + TV pairing panels
app/js/touchlink.js  SSE/POST client for the local relay
app/js/vendor/       qrcode generator (bundled, no CDN)
serve.js             zero-dep static server
tools/touch-relay.mjs  static server + local pairing relay
tools/qa-touch.mjs      end-to-end test of the phone pairing
tools/qa-recipes.mjs    end-to-end test of the recipe slides
tools/measure.mjs       flap geometry measurements
tools/audit.mjs         landing design pre-flight checks
```

## Development

```bash
node tools/qa-touch.mjs "http://<your-lan-ip>:8788"   # phone pairing, 20 checks
node tools/qa-recipes.mjs "http://localhost:8787/app/?demo=1&recipe=carrot"
node tools/measure.mjs "http://localhost:8787/app/?demo=1" 1600 900
node tools/audit.mjs "http://localhost:8787/" 1440 900
```

The tests need Puppeteer. The app itself has no dependencies at all; install
Puppeteer separately if you want to run the tooling.
