import http from "node:http";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { game } from "./gamehttp.js";
import { attachPets } from "./pets.js";
import { pgStore } from "./petstore.js";

import { SERVER_BUILD as BUILD } from "./build.js";

const app = express();

// Behind Caddy, so trust the proxy for correct client IPs and secure cookies.
app.set("trust proxy", 1);

// (owner) security headers: no sniffing, no framing, no referrer leaks, and (for pages the PTR serves) only this site's scripts
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; connect-src 'self' https://play.atamus.io wss://play.atamus.io; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: "32kb" }));

app.use(cors({
  origin(origin, cb) {
    // Allow same-origin / tools with no Origin header, and the listed web origins.
    if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Origin not allowed"));
  },
  credentials: true,
}));

// PTR: the private test copy serves the website itself (same origin, no Pages, no cookies needed)
if (process.env.ATAMUS_PTR === "1") app.use(express.static(new URL("../../../website/", import.meta.url).pathname));
app.get("/healthz", (_req, res) => res.json({ ok: true, build: BUILD })); // live health + build marker

// the deploy workflows' calls (build check, update countdown); the game runs on the WebSocket below
app.use("/game", game);

app.use((err, _req, res, _next) => {
  if (err && err.message === "Origin not allowed")
    return res.status(403).json({ error: "Origin not allowed." });
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

async function main() {
  await migrate();

  const server = http.createServer(app);
  // Critter Courier (owner, 2026-11-11): accounts, rooms, the conveyor, deliveries, kicks, dogs and geese, chat and parties over a WebSocket at /pets
  attachPets(server, { origins: config.allowedOrigins, allowLocal: process.env.ATAMUS_PTR === "1", store: pgStore(pool) });
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`Critter Courier server listening on 127.0.0.1:${config.port} (http + ws)`);
  });
}

main().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});

// a stray rejected promise is logged, never fatal: one bad request must not take the game down for everyone
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
