// Phone-as-touch-screen and phone-as-keyboard.
//
// The TV shows a QR code; scanning it opens this same app on the phone in
// remote mode. The phone then mirrors the board, so tapping a flap on the
// phone flips that flap on the TV, and typing on the phone writes a message
// across the whole board. The TV does the flipping, so you still get the
// animation and the sound.

import { TouchLink, isLocalHost, newRoom } from "./touchlink.js";
import { messageSlide } from "./slides.js";
import { ROWS, COLS } from "./charset.js";

const $ = (id) => document.getElementById(id);
const REMOTE = new URLSearchParams(location.search).has("remote");

function makeQr(text, imgEl) {
  try {
    if (!window.qrcode) return false;
    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    imgEl.src = qr.createDataURL(8, 4);
    return true;
  } catch {
    return false;
  }
}

/* ======================= phone side ======================= */

function initRemote() {
  const panel = $("remote");
  panel.hidden = false;
  document.getElementById("chrome").hidden = true;
  document.getElementById("stage").hidden = true;
  document.body.classList.add("is-remote");

  const room = (location.hash || "").replace("#", "").toUpperCase();
  const statusEl = $("remote-status");
  const mirror = $("remote-mirror");
  const input = $("remote-input");

  const exitBtn = document.querySelector('[data-cmd="exit"]');
  if (exitBtn) {
    exitBtn.textContent = new URLSearchParams(location.search).has("demo") ? "EXIT DEMO" : "OPEN BOARD";
  }

  // one button per flap
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = document.createElement("button");
      b.className = "rm";
      b.type = "button";
      b.textContent = " ";
      b.dataset.r = r;
      b.dataset.c = c;
      cells.push(b);
      mirror.appendChild(b);
    }
  }
  mirror.addEventListener("click", (e) => {
    const b = e.target.closest(".rm");
    if (!b) return;
    link.send("press", { r: +b.dataset.r, c: +b.dataset.c });
    b.classList.remove("on");
    void b.offsetWidth;
    b.classList.add("on");
  });

  $("remote-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    link.send("type", { text });
    input.value = "";
    input.blur();
  });

  document.querySelectorAll("[data-cmd]").forEach((b) => {
    b.addEventListener("click", () => {
      const cmd = b.dataset.cmd;
      if (cmd === "exit") {
        location.href = location.pathname;
        return;
      }
      link.send("cmd", { action: cmd });
    });
  });

  const link = new TouchLink("phone", {
    room: /^[A-Z0-9]{3,8}$/.test(room) ? room : newRoom(),
    onState: (s) => {
      statusEl.textContent = s === "connected" ? "LINKED" : s.toUpperCase();
    },
    onMessage: (type, data) => {
      if (type === "state" && Array.isArray(data?.grid)) {
        data.grid.forEach((line, r) => {
          for (let c = 0; c < COLS; c++) {
            const ch = (line[c] || " ").toUpperCase();
            const el = cells[r * COLS + c];
            if (el && el.textContent !== ch) el.textContent = ch;
          }
        });
      }
    },
  });

  if (!/^[A-Z0-9]{3,8}$/.test(room)) {
    statusEl.textContent = "OPEN ON THE TV FIRST";
  }
  link.connect();
  // keep the screen awake while it is being used as a board
  navigator.wakeLock?.request("screen").catch(() => {});
  return link;
}

/* ======================= TV side ======================= */

function initPairing({ board, cmds, onEdit, onTyped }) {
  const panel = $("pair");
  const statusEl = $("pair-status");
  const roomEl = $("pair-room");
  const help = $("pair-help");
  const qrImg = panel.querySelector("#pair-qr img");
  let link = null;
  // Distinguishes "the user closed the panel" (the link is dead, start a new
  // room) from "a phone joined and the panel closed itself" (link still good).
  // Deliberately not derived from link.open: EventSource clears that flag on a
  // transient error while it reconnects, which would mint a new room.
  let dismissed = false;
  const local = isLocalHost();

  const open = () => {
    panel.hidden = false;
    start();
  };
  const close = () => {
    panel.hidden = true;
    dismissed = true;
    link?.close();
  };
  $("pair-close").onclick = close;

  function pushState() {
    link?.send("state", { grid: board.snapshot() });
  }

  if (local) {
    statusEl.textContent = "SERVED FROM LOCALHOST";
    help.hidden = false;
    $("pair-lan").textContent =
      "Start the relay with: node tools/touch-relay.mjs — it prints a network address to open here.";
    return { open, close, pushState, isLinked: () => false };
  }

  function start() {
    if (link && !dismissed) return; // still listening, keep the same room
    link?.close();
    dismissed = false;
    const room = newRoom();
    const url = `${location.origin}${location.pathname}?remote#${room}`;
    roomEl.textContent = room;
    if (!makeQr(url, qrImg)) {
      statusEl.textContent = "QR UNAVAILABLE";
    }

    link = new TouchLink("tv", {
      room,
      onState: (s) => {
        if (s !== "connected") statusEl.textContent = s.toUpperCase();
      },
      onPeer: (online) => {
        if (online) {
          statusEl.textContent = "PHONE CONNECTED";
          setTimeout(() => {
            panel.hidden = true;
            pushState();
          }, 900);
        } else {
          statusEl.textContent = "WAITING FOR A PHONE";
        }
      },
      onMessage: (type, data) => {
        if (type === "press") handlePress(data);
        else if (type === "type") onTyped?.(String(data?.text || "").slice(0, 60));
        else if (type === "cmd") cmds?.[data?.action]?.();
      },
    });
    link.connect();
    statusEl.textContent = "WAITING FOR A PHONE";
  }

  async function handlePress({ r, c } = {}) {
    const row = +r;
    const col = +c;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    const ch = await board.nudge(row, col);
    if (ch == null) return;
    // The owner of the grid owns the bookkeeping, so a redraw can restore the
    // letter later instead of quietly putting the old one back.
    onEdit?.(row, col, ch);
    pushState();
  }

  // The panel stays closed until the TV owner asks for it. Opening a QR room on
  // every page load meant the board was never actually showing the board.
  return { open, close, pushState, isLinked: () => !!link?.open };
}

export { initRemote, initPairing, REMOTE };
