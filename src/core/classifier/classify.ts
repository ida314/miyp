import { createLogger } from "../../utils/logger";
import { ParsedQuery } from "../../types/parsedQuery";
import { CRISIS_KEYWORDS, BUDDHIST_LABELS } from "../../types/labels";

const log = createLogger("classifier");

export interface ClassificationResult {
  parsedQuery: ParsedQuery;
  isCrisis: boolean;
  safetyFlags: string[];
}

/**
 * Refines and validates the parsed query labels.
 * Checks for crisis indicators and normalizes labels against the ontology.
 */
export function classify(parsedQuery: ParsedQuery, rawMessage: string): ClassificationResult {
  log.info("Classifying parsed query", {
    labels: parsedQuery.buddhist_labels,
  });

  // Check for crisis indicators
  const safetyFlags: string[] = [];
  const lowerMessage = rawMessage.toLowerCase();

  for (const keyword of CRISIS_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      safetyFlags.push(`crisis_keyword_detected: ${keyword}`);
    }
  }

  const isCrisis =
    parsedQuery.urgency === "crisis" || safetyFlags.length > 0;

  if (isCrisis) {
    parsedQuery.urgency = "crisis";
    log.warn("Crisis detected", { safetyFlags });
  }

  // Normalize buddhist labels — keep only those in the ontology
  const validLabels = new Set<string>(BUDDHIST_LABELS);
  const normalizedLabels = parsedQuery.buddhist_labels.filter((label) =>
    validLabels.has(label)
  );

  // If no valid labels after normalization, infer from emotion labels
  if (normalizedLabels.length === 0) {
    const inferred = inferBuddhistLabels(parsedQuery.emotion_labels);
    normalizedLabels.push(...inferred);
    log.debug("Inferred buddhist labels from emotions", { inferred });
  }

  parsedQuery.buddhist_labels = normalizedLabels;

  log.debug("Classification complete", {
    isCrisis,
    safetyFlags,
    finalLabels: normalizedLabels,
  });

  return { parsedQuery, isCrisis, safetyFlags };
}

/**
 * Infer Buddhist labels from emotion labels when the LLM didn't produce valid ones.
 */
function inferBuddhistLabels(emotionLabels: string[]): string[] {
  const mapping: Record<string, string> = {
    anger: "aversion_anger",
    resentment: "aversion_anger",
    jealousy: "craving_attachment",
    envy: "craving_attachment",
    anxiety: "fear_anxiety",
    worry: "fear_anxiety",
    fear: "fear_anxiety",
    grief: "grief_loss",
    sadness: "grief_loss",
    loneliness: "grief_loss",
    guilt: "ethical_conflict",
    shame: "ethical_conflict",
    frustration: "aversion_anger",
    restlessness: "restlessness_distraction",
    boredom: "restlessness_distraction",
    confusion: "delusion_confusion",
    indecision: "doubt_indecision",
    craving: "craving_attachment",
    longing: "craving_attachment",
    regret: "ethical_conflict",
  };

  const inferred = new Set<string>();
  for (const emotion of emotionLabels) {
    const label = mapping[emotion.toLowerCase()];
    if (label) inferred.add(label);
  }

  return [...inferred];
}