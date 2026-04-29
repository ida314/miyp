export interface ChatResponse {
  answer: string;
  citations: { source_ref: string }[];
  diagnostic_labels: string[];
  safety_flags: string[];
}
