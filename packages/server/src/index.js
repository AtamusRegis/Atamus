import http from "node:http";
import { startWatch } from "./watch.js";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { migrate, cleanupExpired, runWipes } from "./db.js";
import { auth } from "./auth.js";
import { game } from "./gamehttp.js";
import { admin, loadPersonas } from "./admin.js";
import { attachGameServer } from "./game/net.js";
import { loadNameData } from "./names.js";
import { loadRelations } from "./relations.js";
import { startGeo } from "./geo.js";

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

app.use("/auth", auth);
app.use("/game/admin", admin);   // (owner) the admin panel (under /game: the path the live proxy already passes on)
app.use("/game", game);

app.use((err, _req, res, _next) => {
  if (err && err.message === "Origin not allowed")
    return res.status(403).json({ error: "Origin not allowed." });
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

async function main() {
  await migrate();
  await loadPersonas();
  await loadNameData();
  await loadRelations();                                 // (owner) players' mutes and blocks
  startGeo(); startWatch();                                            // (owner) IP places and VPN lists for the login checks (security.js)
  await runWipes();
  await cleanupExpired();
  setInterval(() => cleanupExpired().catch((e) => console.error("cleanup", e)), 3600_000).unref();

  const server = http.createServer(app);
  attachGameServer(server);
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`Atamus server listening on 127.0.0.1:${config.port} (http + ws)`);
  });
}

main().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});

// a stray rejected promise is logged, never fatal: one bad request must not take the game down for everyone
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
