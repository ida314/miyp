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
