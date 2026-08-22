#!/usr/bin/env node
// Shopify sales relay for FLAPBOARD.
//
// Serves the JSON that the board's "Stats feed" slide expects:
//   { "title": "TODAY", "rows": [["SALES","$1,204.00"],["ORDERS","38"],["AOV","$31.68"]] }
//
// Usage:
//   SHOPFY_STORE=your-store.myshopify.com \\
//   SHOPIFY_TOKEN=shpat_xxxx \\
//   PORT=8788 node shopify-stats-server.mjs
//
// Get a token: Shopify Admin → Settings → Apps → Develop apps → create app →
// grant "read_orders" (and read_products if you want) → install → reveal token.
// Then point the board's Stats Feed URL at http://localhost:8788/stats
// (put it behind https or a tunnel like cloudflared for remote TVs).

import http from "http";

const STORE = process.env.SHOPFY_STORE || process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_TOKEN;
const PORT = Number(process.env.PORT || 8788);

if (!STORE || !TOKEN) {
  console.error("Set SHOPFY_STORE and SHOPIFY_TOKEN env vars first.");
  process.exit(1);
}

const money = (n) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function shopify(query, variables) {
  const r = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error("shopify http " + r.status);
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 200));
  return j.data;
}

let cache = { at: 0, payload: null };

async function buildStats() {
  if (Date.now() - cache.at < 60_000 && cache.payload) return cache.payload;

  // Today's paid orders via GraphQL. `today` is interpreted in store timezone by Shopify.
  const q = `
    query($q: String!) {
      orders(first: 250, query: $q) {
        edges {
          node {
            totalPriceSet { shopMoney { amount } }
            customer { firstName }
          }
        }
      }
      shop { name currencyCode }
    }`;
  const data = await shopify(q, { q: "status:paid created_at:>=today" });
  const orders = data.orders.edges.map((e) => e.node);
  let total = 0;
  const buyers = new Set();
  for (const o of orders) total += parseFloat(o.totalPriceSet.shopMoney.amount);
  const count = orders.length;
  const aov = count ? total / count : 0;

  const rows = [
    ["SALES", money(total)],
    ["ORDERS", String(count)],
    ["AVG ORDER", money(aov)],
  ];

  const payload = { title: "TODAY · " + (data.shop.name || "SHOP").toUpperCase().slice(0, 12), rows };
  cache = { at: Date.now(), payload };
  return payload;
}

http
  .createServer(async (req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    };
    if (req.url.startsWith("/stats")) {
      try {
        res.writeHead(200, cors);
        res.end(JSON.stringify(await buildStats()));
      } catch (e) {
        res.writeHead(502, cors);
        res.end(JSON.stringify({ error: e.message }));
      }
    } else {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: true, hint: "GET /stats" }));
    }
  })
  .listen(PORT, () => console.log(`Shopify stats relay on http://localhost:${PORT}/stats`));
