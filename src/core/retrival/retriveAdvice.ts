import { createLogger } from "../../utils/logger";
import { ParsedQuery } from "../../types/parsedQuery";
import { AdviceUnit } from "../../types/adviceUnit";
import { searchByLabels, searchBySemantic } from "../../db/adviceStore";

const log = createLogger("retriever");

/**
 * Retrieve candidate AdviceUnits using label matching and semantic similarity.
 * Combines results from both strategies and deduplicates.
 */
export async function retrieveAdvice(
  parsedQuery: ParsedQuery,
  topK: number = 10
): Promise<AdviceUnit[]> {
  log.info("Retrieving advice units", {
    labels: parsedQuery.buddhist_labels,
    situation: parsedQuery.user_situation,
  });

  // Strategy 1: Label-based retrieval
  const labelResults = searchByLabels(parsedQuery.buddhist_labels);
  log.debug("Label search results", { count: labelResults.length });

  // Strategy 2: Semantic similarity over the situation summary (uses embeddings, falls back to text overlap)
  const semanticResults = await searchBySemantic(parsedQuery.user_situation, topK);
  log.debug("Semantic search results", { count: semanticResults.length });

  // Merge and deduplicate, preserving order (label matches first)
  const seen = new Set<string>();
  const merged: AdviceUnit[] = [];

  for (const unit of [...labelResults, ...semanticResults]) {
    if (!seen.has(unit.id)) {
      seen.add(unit.id);
      merged.push(unit);
    }
  }

  const result = merged.slice(0, topK);
  log.info("Retrieved advice units", { count: result.length });

  return result;
}
