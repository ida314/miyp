import { Router, Request, Response } from "express";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createLogger } from "../utils/logger";

const log = createLogger("feedback");
const router = Router();
const FEEDBACK_PATH = join(__dirname, "../../data/feedback.jsonl");

interface FeedbackRecord {
  timestamp: string;
  session_id: string;
  rating: "up" | "down";
  diagnostic_labels: string[];
  citations: string[];
  response_index: number;
}

router.post("/", (req: Request, res: Response) => {
  const { session_id, rating, diagnostic_labels, citations, response_index } = req.body;

  if (!session_id || !rating || !["up", "down"].includes(rating)) {
    res.status(400).json({ error: "Invalid feedback payload" });
    return;
  }

  const record: FeedbackRecord = {
    timestamp: new Date().toISOString(),
    session_id: String(session_id).slice(0, 64),
    rating,
    diagnostic_labels: Array.isArray(diagnostic_labels) ? diagnostic_labels : [],
    citations: Array.isArray(citations) ? citations : [],
    response_index: Number.isInteger(response_index) ? response_index : 0,
  };

  // Primary record — stdout is captured by Railway logs
  log.info("Feedback received", record as unknown as Record<string, unknown>);

  // Secondary — local file for dev inspection (ephemeral on Railway without a volume)
  try {
    mkdirSync(join(__dirname, "../../data"), { recursive: true });
    appendFileSync(FEEDBACK_PATH, JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // Non-fatal
  }

  res.json({ ok: true });
});

export default router;
