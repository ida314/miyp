import { createLogger } from "../../utils/logger";
import { ParsedQuery } from "../../types/parsedQuery";
import { AdviceUnit } from "../../types/adviceUnit";

const log = createLogger("reranker");

interface ScoredUnit {
  unit: AdviceUnit;
  score: number;
}

/**
 * Rerank candidate AdviceUnits based on:
 * - Label match quality
 * - Confidence score
 * - Human review status
 * - Text relevance to the user's situation
 */
export function rerank(
  candidates: AdviceUnit[],
  parsedQuery: ParsedQuery,
  topK: number = 5
): AdviceUnit[] {
  log.info("Reranking candidates", { count: candidates.length });

  const queryLabels = new Set(parsedQuery.buddhist_labels);
  const queryWords = new Set(
    parsedQuery.user_situation
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  );

  const scored: ScoredUnit[] = candidates.map((unit) => {
    let score = 0;

    // 1. Label match score (0-40 points)
    const matchingLabels = unit.buddhist_labels.filter((l) =>
      queryLabels.has(l)
    ).length;
    const labelScore =
      queryLabels.size > 0
        ? (matchingLabels / queryLabels.size) * 40
        : 10;
    score += labelScore;

    // 2. Confidence score (0-20 points)
    score += unit.confidence * 20;

    // 3. Review status bonus (0-15 points)
    if (unit.review_status === "human_reviewed") score += 15;
    else if (unit.review_status === "auto") score += 5;
    // flagged gets 0

    // 4. Text relevance (0-25 points)
    const unitText = [
      unit.problem_summary,
      unit.diagnosis,
      unit.teaching,
    ]
      .join(" ")
      .toLowerCase();
    const unitWords = new Set(
      unitText.split(/\W+/).filter((w) => w.length > 2)
    );
    const overlap = [...queryWords].filter((w) => unitWords.has(w)).length;
    const textScore =
      queryWords.size > 0
        ? (overlap / queryWords.size) * 25
        : 5;
    score += textScore;

    return { unit, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const result = scored.slice(0, topK).map((s) => s.unit);

  log.debug("Reranking complete", {
    topScores: scored.slice(0, topK).map((s) => ({
      id: s.unit.id,
      ref: s.unit.source_ref,
      score: Math.round(s.score * 100) / 100,
    })),
  });

  return result;
}
