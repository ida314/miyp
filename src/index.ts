import "dotenv/config";
import express from "express";
import { join } from "path";
import rateLimit from "express-rate-limit";
import { createLogger } from "./utils/logger";
import { loadAdviceUnits } from "./db/adviceStore";
import chatRoute from "./api/chatRoute";
import ingestRoute from "./api/ingestRoute";
import evalRoute from "./api/evalRoute";
import blogRoute from "./api/blogRoute";

const log = createLogger("server");

const app = express();
app.set("trust proxy", 1);
const PORT = parseInt(process.env.PORT || "3000", 10);

// Rate limiters — applied only to /chat/respond (the LLM endpoint)
// Burst limiter: max 10 requests per minute per IP
const burstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_MIN || "10", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment before trying again." },
  handler: (req, res, _next, options) => {
    log.warn("Rate limit hit (burst)", { ip: req.ip });
    res.status(429).json(options.message);
  },
});

// Daily limiter: max 100 requests per day per IP
const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_DAY || "100", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Daily limit reached. Please come back tomorrow." },
  handler: (req, res, _next, options) => {
    log.warn("Rate limit hit (daily)", { ip: req.ip });
    res.status(429).json(options.message);
  },
});

// CORS — restrict to CORS_ORIGIN in production, permissive in dev
const corsOrigin = process.env.CORS_ORIGIN;
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Password gate — enabled only when SITE_PASSWORD env var is set
const SITE_PASSWORD = process.env.SITE_PASSWORD;
const COOKIE_NAME = "site_access";
const COOKIE_TOKEN = "granted";

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v;
  }
}

if (SITE_PASSWORD) {
  // GET /access — serve the gate page
  app.get("/access", (_req, res) => {
    res.sendFile(join(__dirname, "../public/access.html"));
  });

  // POST /access — validate password and set cookie
  app.post("/access", (req, res) => {
    if (req.body?.password === SITE_PASSWORD) {
      res.setHeader("Set-Cookie", `${COOKIE_NAME}=${COOKIE_TOKEN}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`);
      res.redirect("/");
    } else {
      res.redirect("/access?error=1");
    }
  });

  // Gate middleware — runs before static files and routes
  app.use((req, res, next) => {
    // Allow: the access page itself, health check, and static assets (CSS/fonts so gate page renders)
    const exempt =
      req.path === "/access" ||
      req.path === "/health" ||
      req.path.startsWith("/css/") ||
      req.path.startsWith("/fonts/");
    if (exempt) return next();

    const token = parseCookie(req.headers.cookie, COOKIE_NAME);
    if (token === COOKIE_TOKEN) return next();

    res.redirect("/access");
  });
}

// Serve static files
app.use(express.static(join(__dirname, "../public")));

// Request logging
app.use((req, _res, next) => {
  log.debug("Incoming request", { method: req.method, path: req.path });
  next();
});

// Routes — rate limiters scoped to the LLM endpoint only
app.use("/chat", burstLimiter, dailyLimiter, chatRoute);
app.use("/blog", blogRoute);
app.use("/ingest", ingestRoute);
app.use("/eval", evalRoute);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Load data and start server
loadAdviceUnits();

const server = app.listen(PORT, () => {
  log.info(`Monk in Your Pocket server running on port ${PORT}`);
});

// Graceful shutdown — allow in-flight requests to finish before exit
function shutdown(signal: string) {
  log.info(`${signal} received, shutting down`);
  server.close(() => {
    log.info("Server closed");
    process.exit(0);
  });
  // Force exit if shutdown takes too long
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

export default app;
