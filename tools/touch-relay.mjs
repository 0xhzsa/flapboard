// FLAPBOARD touch relay: serves the app and pairs a TV with a phone on the same
// network. Zero dependencies. Plain HTTP, no WebSocket implementation needed:
// clients POST messages and listen with Server-Sent Events.
//
//   node tools/touch-relay.mjs        # PORT env optional, default 8788
//
// The TV opens http://<this-machine>:8788/ and presses TOUCH. It shows a QR code;
// scan it with a phone and the phone becomes a touch screen and keyboard.

import http from "http";
import { readFile } from "fs/promises";
import { extname, join, normalize, dirname } from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 8788);

/** room -> { tv: res|null, phone: res|null } */
const rooms = new Map();
const ROLES = ["tv", "phone"];

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const peerOf = (role) => (role === "tv" ? "phone" : "tv");

function sseSend(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    /* client went away */
  }
}

/** Tell both halves of a room whether the other half is present. */
function syncRoom(room) {
  const r = rooms.get(room);
  if (!r) return;
  for (const role of ROLES) {
    if (r[role]) sseSend(r[role], { t: "peer", role, online: !!r[peerOf(role)] });
  }
}

function dropClient(role, res) {
  for (const [room, r] of rooms) {
    if (r[role] === res) {
      r[role] = null;
      syncRoom(room);
      if (!r.tv && !r.phone) rooms.delete(room);
    }
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);

  res.setHeader("Cache-Control", "no-cache");

  if (p === "/pair/listen") {
    const room = (url.searchParams.get("room") || "").toUpperCase();
    const role = url.searchParams.get("role");
    if (!/^[A-Z0-9]{3,8}$/.test(room) || !ROLES.includes(role)) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("bad room");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": open\n\n");

    let r = rooms.get(room);
    if (!r) rooms.set(room, (r = { tv: null, phone: null }));
    if (r[role]) {
      // same role reconnected: retire the old stream
      try {
        r[role].end();
      } catch {}
    }
    r[role] = res;
    syncRoom(room);
    syncRoom(room);

    const beat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {}
    }, 25000);

    req.on("close", () => {
      clearInterval(beat);
      dropClient(role, res);
    });
    return;
  }

  if (p === "/pair/msg" && req.method === "POST") {
    const { room, role, type, data } = await readBody(req);
    const r = rooms.get(String(room || "").toUpperCase());
    const target = r && ROLES.includes(role) ? r[peerOf(role)] : null;
    if (target) sseSend(target, { t: "msg", from: role, type, data });
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
    return;
  }

  if (p === "/pair/info") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  try {
    let f = p;
    if (f.endsWith("/")) f += "index.html";
    if (f === "/") f = "/index.html";
    f = normalize(f).replace(/^(\.\.[\/\\])+/, "");
    const data = await readFile(join(root, f));
    res.writeHead(200, { "Content-Type": types[extname(f).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(port, "0.0.0.0", () => {
  const lan = lanAddresses();
  console.log("FLAPBOARD touch relay");
  console.log(`  on this machine:  http://localhost:${port}/`);
  for (const ip of lan) console.log(`  on your network:  http://${ip}:${port}/`);
  if (!lan.length) console.log("  (no network interface found, phones cannot reach this)");
  console.log("");
  console.log("Open the network URL on the TV, press TOUCH, then scan the QR with a phone.");
});
