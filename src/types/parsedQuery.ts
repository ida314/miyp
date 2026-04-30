export type QueryType = "guidance" | "concept" | "meta" | "greeting" | "off_topic";

export interface ParsedQuery {
  query_type: QueryType;
  user_situation: string;
  emotion_labels: string[];
  buddhist_labels: string[];
  urgency: "low" | "medium" | "high" | "crisis";
  intent: string;
  tone_needed: string;
}