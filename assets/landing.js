// The hero board is the product running, not a screenshot of it. This imports
// the same engine and the same slide builders the display app uses.

import { Board } from "../app/js/board.js";
import { sound } from "../app/js/sound.js";
import { clockSlide, departuresSlide, eventsSlide, messageSlide } from "../app/js/slides.js";

const root = document.getElementById("heroBoard");
if (root) {
  sound.enabled = false; // a landing page has no business making noise

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const board = new Board(root, { inset: { w: 4, h: 4 } });
  board.stepMs = reduced ? 1 : 46;
  board.maxSteps = reduced ? 1 : 5;
  board.animate = !reduced;
  board.setFlapFit("wide");

  const label = document.getElementById("heroLabel");
  const settings = { units: "F", city: "" };

  const FLIGHTS = [
    "07:25|LONDON|BA842|ON TIME",
    "08:10|PARIS|AF1516|BOARDING",
    "09:45|NEW YORK|KL622|DELAYED",
    "11:30|TOKYO|JL432|ON TIME",
    "13:05|BERLIN|SK506|CANCELLED",
  ];
  const EVENTS = [
    "TITLE FIGHT NIGHT - DOORS AT 8",
    "DJ SETS EVERY FRIDAY",
    "QUIZ NIGHT WEDNESDAYS",
  ];

  const reel = [
    { name: "YOUR OWN WORDS", grid: () => messageSlide("SET IT ONCE|IT FLIPS ITSELF|EVERY DAY").grid },
    { name: "DEPARTURES", grid: () => departuresSlide(FLIGHTS) },
    { name: "WHAT'S ON", grid: () => eventsSlide(EVENTS, new Date()) },
    { name: "MESSAGES BY THE HOUR", grid: () => messageSlide("07:00-11:00 FRESH CROISSANTS|16:00-19:00 HAPPY HOUR IS ON").grid },
    { name: "THE TIME, WHEREVER YOU ARE", grid: () => clockSlide(new Date(), settings) },
  ];

  let i = -1;
  let timer = null;
  let running = false;

  function step() {
    i = (i + 1) % reel.length;
    label.textContent = reel[i].name;
    board.show(reel[i].grid());
  }

  function play() {
    clearInterval(timer);
    running = true;
    timer = setInterval(step, 4600);
  }

  function pause() {
    clearInterval(timer);
    running = false;
  }

  board.boot(reel[0].grid()).then(play).catch(play);

  // only animate the board while it is actually on screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? (running || play()) : pause())),
      { threshold: 0.15 }
    ).observe(root);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else play();
  });
}
