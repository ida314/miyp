import { Router, Request, Response } from "express";
import { addUnits } from "../db/adviceStore";
import { AdviceUnit } from "../types/adviceUnit";
import { createLogger } from "../utils/logger";

const log = createLogger("ingestRoute");
const router = Router();

/**
 * POST /ingest/advice-units
 * Write validated AdviceUnits into the in-memory store.
 * Accepts a JSON body with an "advice_units" array.
 */
router.post("/advice-units", (req: Request, res: Response) => {
  const body = req.body;

  const incoming: AdviceUnit[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.advice_units)
    ? body.advice_units
    : null;

  if (!incoming) {
    res.status(400).json({
      error: "Body must be an array of AdviceUnits or { advice_units: [...] }",
    });
    return;
  }

  const invalid = incoming.filter(
    (u) => !u.id || !u.source_ref || !u.problem_summary || !u.buddhist_labels
  );
  if (invalid.length > 0) {
    res.status(400).json({
      error: `${invalid.length} units missing required fields (id, source_ref, problem_summary, buddhist_labels)`,
      invalid_ids: invalid.map((u) => u.id ?? "(missing id)"),
    });
    return;
  }

  log.info("Ingesting advice units", { count: incoming.length });
  addUnits(incoming);

  res.json({ ingested: incoming.length });
});

export default router;
