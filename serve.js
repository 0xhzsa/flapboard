// Zero-dependency static file server for FLAPBOARD.
// Usage: node serve.js  (PORT env optional, default 8787)
import http from "http";
import { readFile } from "fs/promises";
import { extname, join, normalize } from "path";

const root = process.cwd();
const port = Number(process.env.PORT || 8787);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http
  .createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (p.endsWith("/")) p += "index.html";
      if (p === "/") p = "/index.html";
      p = normalize(p).replace(/^(\.\.[\/\\])+/, "");
      const data = await readFile(join(root, p));
      res.writeHead(200, {
        "Content-Type": types[extname(p).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  })
  .listen(port, "0.0.0.0", () => console.log(`FLAPBOARD serving on http://0.0.0.0:${port}`));
