export interface AdviceUnit {
  id: string;
  source_collection: "AN" | "MN" | "SN";
  source_ref: string;
  translator: string;
  canonical_passage: string;
  context_summary: string;
  problem_summary: string;
  buddhist_labels: string[];
  diagnosis: string;
  teaching: string;
  practice_actions: string[];
  audience: "lay" | "monastic" | "general";
  confidence: number;
  review_status: "auto" | "human_reviewed" | "flagged";
}
