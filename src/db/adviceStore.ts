import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { AdviceUnit } from "../types/adviceUnit";
import { embedText } from "../utils/llm";
import { createLogger } from "../utils/logger";

const log = createLogger("adviceStore");

let units: AdviceUnit[] = [];
let embeddingIndex: Map<string, number[]> = new Map();

/**
 * Load AdviceUnits from seed file and all generated per-vagga files.
 */
export function loadAdviceUnits(): void {
  units = [];

  // 1. Load seed data
  const seedPath = join(__dirname, "../../data/seed-advice-units.json");
  try {
    const raw = readFileSync(seedPath, "utf-8");
    const seedUnits = JSON.parse(raw) as AdviceUnit[];
    units.push(...seedUnits);
    log.info("Loaded seed advice units", { count: seedUnits.length });
  } catch (error) {
    log.warn("No seed advice units found", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 2. Load generated files from all corpus directories
  for (const corpus of ["an5", "mn", "sn"]) {
    const generatedDir = join(__dirname, `../../data/generated/${corpus}`);
    if (!existsSync(generatedDir)) continue;
    try {
      const files = readdirSync(generatedDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const filePath = join(generatedDir, file);
        const raw = readFileSync(filePath, "utf-8");
        const fileUnits = JSON.parse(raw) as AdviceUnit[];
        units.push(...fileUnits);
        log.debug("Loaded generated file", { corpus, file, count: fileUnits.length });
      }
      log.info("Loaded generated advice units", {
        corpus,
        files: files.length,
      });
    } catch (error) {
      log.warn("Failed to load generated advice units", {
        corpus,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Deduplicate by ID (seed takes precedence)
  const seen = new Set<string>();
  units = units.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });

  // Load embeddings sidecar
  const embeddingsPath = join(__dirname, "../../data/embeddings.json");
  if (existsSync(embeddingsPath)) {
    try {
      const raw = readFileSync(embeddingsPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, number[]>;
      embeddingIndex = new Map(Object.entries(parsed));
      log.info("Loaded embeddings", { count: embeddingIndex.size });
    } catch (error) {
      log.warn("Failed to load embeddings", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info("Total advice units loaded", { count: units.length });
}

/**
 * Persist the current embedding index to disk.
 */
export function saveEmbeddings(): void {
  const embeddingsPath = join(__dirname, "../../data/embeddings.json");
  const obj: Record<string, number[]> = {};
  for (const [id, emb] of embeddingIndex) {
    obj[id] = emb;
  }
  writeFileSync(embeddingsPath, JSON.stringify(obj), "utf-8");
  log.info("Saved embeddings", { count: embeddingIndex.size });
}

/**
 * Add or update an embedding for a unit.
 */
export function setEmbedding(unitId: string, embedding: number[]): void {
  embeddingIndex.set(unitId, embedding);
}

/**
 * Add a batch of AdviceUnits to the in-memory store (used by /ingest/advice-units).
 */
export function addUnits(newUnits: AdviceUnit[]): void {
  const seen = new Set(units.map((u) => u.id));
  let added = 0;
  for (const unit of newUnits) {
    if (!seen.has(unit.id)) {
      units.push(unit);
      seen.add(unit.id);
      added++;
    }
  }
  log.info("Added advice units", { added, total: units.length });
}

/**
 * Get all loaded AdviceUnits.
 */
export function getAllUnits(): AdviceUnit[] {
  return units;
}

/**
 * Search units by matching any of the given Buddhist labels.
 * Returns units sorted by number of matching labels (descending).
 */
export function searchByLabels(labels: string[]): AdviceUnit[] {
  if (labels.length === 0) {
    log.error("No labels provided", { labels });
    return [...units];
  }
  const lowerLabels = labels.map((l) => l.toLowerCase());

  const scored = units
    .map((unit) => {
      const matchCount = unit.buddhist_labels.filter((bl) =>
        lowerLabels.some(
          (l) => bl.toLowerCase().includes(l) || l.includes(bl.toLowerCase())
        )
      ).length;
      return { unit, matchCount };
    })
    .filter((s) => s.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount);

  return scored.map((s) => s.unit);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

/**
 * Semantic similarity search using pre-computed embeddings.
 * Falls back to text search if no embeddings are available.
 */
export async function searchBySemantic(query: string, topK: number = 10): Promise<AdviceUnit[]> {
  const unitsWithEmbeddings = units.filter((u) => embeddingIndex.has(u.id));

  if (unitsWithEmbeddings.length === 0) {
    log.debug("No embeddings available, falling back to text search");
    return searchByText(query, topK);
  }

  try {
    const queryEmbedding = await embedText(query);
    const scored = unitsWithEmbeddings.map((unit) => ({
      unit,
      score: cosineSimilarity(queryEmbedding, embeddingIndex.get(unit.id)!),
    }));
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.unit);
  } catch (error) {
    log.warn("Semantic search failed, falling back to text search", {
      error: error instanceof Error ? error.message : String(error),
    });
    return searchByText(query, topK);
  }
}

/**
 * Simple text-similarity search over problem_summary, diagnosis, and teaching fields.
 * Uses word-overlap scoring (no embeddings for MVP).
 */
export function searchByText(query: string, topK: number = 10): AdviceUnit[] {
  const queryWords = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  );

  const scored = units.map((unit) => {
    const unitText = [
      unit.problem_summary,
      unit.diagnosis,
      unit.teaching,
      ...unit.practice_actions,
    ]
      .join(" ")
      .toLowerCase();

    const unitWords = unitText.split(/\W+/).filter((w) => w.length > 2);
    const overlap = unitWords.filter((w) => queryWords.has(w)).length;
    const score = overlap / Math.max(queryWords.size, 1);

    return { unit, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.unit);
}
