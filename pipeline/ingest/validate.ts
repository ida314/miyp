import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { AdviceUnit } from "../../src/types/adviceUnit";
import { BUDDHIST_LABELS } from "../../src/types/labels";

const REVIEW_DIR = join(__dirname, "../../data/review");

interface ValidationResult {
  valid: AdviceUnit[];
  flagged: FlaggedUnit[];
  rejected: RejectedUnit[];
}

interface FlaggedUnit {
  unit: AdviceUnit;
  reasons: string[];
}

interface RejectedUnit {
  unit: AdviceUnit;
  reasons: string[];
}

const VALID_LABELS = new Set<string>(BUDDHIST_LABELS);

/**
 * Validate a single AdviceUnit.
 * Returns null if valid, or an array of issues if flagged/rejected.
 */
function validateUnit(unit: AdviceUnit): { severity: "flag" | "reject"; reasons: string[] } | null {
  const reasons: string[] = [];
  let isReject = false;

  // Required field checks
  if (!unit.problem_summary || unit.problem_summary.length < 10) {
    reasons.push("problem_summary is missing or too short");
    isReject = true;
  }

  if (!unit.diagnosis || unit.diagnosis.length < 10) {
    reasons.push("diagnosis is missing or too short");
    isReject = true;
  }

  if (!unit.teaching || unit.teaching.length < 10) {
    reasons.push("teaching is missing or too short");
    isReject = true;
  }

  if (!unit.practice_actions || unit.practice_actions.length === 0) {
    reasons.push("no practice_actions provided");
    isReject = true;
  }

  if (!unit.canonical_passage || unit.canonical_passage.length < 10) {
    reasons.push("canonical_passage is missing or too short");
    isReject = true;
  }

  // Label validation
  if (!unit.buddhist_labels || unit.buddhist_labels.length === 0) {
    reasons.push("no buddhist_labels assigned");
    isReject = true;
  } else {
    const invalidLabels = unit.buddhist_labels.filter((l) => !VALID_LABELS.has(l));
    if (invalidLabels.length > 0) {
      reasons.push(`invalid labels: ${invalidLabels.join(", ")}`);
    }
  }

  // Confidence check
  if (unit.confidence < 0.5) {
    reasons.push(`very low confidence: ${unit.confidence}`);
  } else if (unit.confidence < 0.7) {
    reasons.push(`low confidence: ${unit.confidence}`);
  }

  // Vagueness checks
  if (unit.diagnosis && /general|various|many|some/i.test(unit.diagnosis) && unit.diagnosis.length < 50) {
    reasons.push("diagnosis seems vague");
  }

  if (unit.practice_actions.some((a) => a.length < 15)) {
    reasons.push("some practice_actions are very short");
  }

  if (reasons.length === 0) return null;

  return { severity: isReject ? "reject" : "flag", reasons };
}

/**
 * Validate a batch of AdviceUnits.
 */
export function validateUnits(units: AdviceUnit[]): ValidationResult {
  const valid: AdviceUnit[] = [];
  const flagged: FlaggedUnit[] = [];
  const rejected: RejectedUnit[] = [];

  for (const unit of units) {
    const result = validateUnit(unit);

    if (!result) {
      valid.push(unit);
    } else if (result.severity === "reject") {
      rejected.push({ unit, reasons: result.reasons });
    } else {
      flagged.push({ unit, reasons: result.reasons });
    }
  }

  return { valid, flagged, rejected };
}

/**
 * Save flagged units to a review queue JSON file for manual editing.
 */
export function saveReviewQueue(flagged: FlaggedUnit[], rejected: RejectedUnit[]): void {
  mkdirSync(REVIEW_DIR, { recursive: true });

  const reviewData = {
    generated_at: new Date().toISOString(),
    instructions: [
      "Review each flagged unit below.",
      "Fix issues and set review_status to 'human_reviewed' when done.",
      "Delete units that are not worth keeping.",
      "Move reviewed units to the appropriate vagga file in data/generated/an5/.",
    ],
    summary: {
      flagged_count: flagged.length,
      rejected_count: rejected.length,
    },
    flagged: flagged.map((f) => ({
      ...f.unit,
      _review_reasons: f.reasons,
      _review_action: "NEEDS_REVIEW",
    })),
    rejected: rejected.map((r) => ({
      ...r.unit,
      _review_reasons: r.reasons,
      _review_action: "REJECTED — fix or delete",
    })),
  };

  const outPath = join(REVIEW_DIR, "review-queue.json");
  writeFileSync(outPath, JSON.stringify(reviewData, null, 2), "utf-8");
  console.log(`\n📋 Review queue saved to data/review/review-queue.json`);
  console.log(`   ${flagged.length} flagged, ${rejected.length} rejected`);
}
