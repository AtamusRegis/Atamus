import fs from "node:fs";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { migrate, cleanupExpired } from "./db.js";
import { auth } from "./auth.js";

// Short git SHA of the running code, reported by /healthz (written by deploy.sh / setup.sh).
let BUILD = "dev";
try { BUILD = fs.readFileSync(new URL("../BUILD", import.meta.url), "utf8").trim(); } catch {}

const app = express();

// Behind Caddy, so trust the proxy for correct client IPs and secure cookies.
app.set("trust proxy", 1);

app.use(express.json({ limit: "32kb" }));

app.use(cors({
  origin(origin, cb) {
    // Allow same-origin / tools with no Origin header, and the listed web origins.
    if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Origin not allowed"));
  },
  credentials: true,
}));

app.get("/healthz", (_req, res) => res.json({ ok: true, build: BUILD })); // live health + build marker

app.use("/auth", auth);

app.use((err, _req, res, _next) => {
  if (err && err.message === "Origin not allowed")
    return res.status(403).json({ error: "Origin not allowed." });
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

async function main() {
  await migrate();
  await cleanupExpired();
  setInterval(() => cleanupExpired().catch((e) => console.error("cleanup", e)), 3600_000).unref();

  app.listen(config.port, "127.0.0.1", () => {
    console.log(`Atamus server listening on 127.0.0.1:${config.port}`);
  });
}

main().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
