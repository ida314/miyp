import { callLLMJson } from "../../utils/llm";
import { createLogger } from "../../utils/logger";
import { ParsedQuery, QueryType } from "../../types/parsedQuery";
import { BUDDHIST_LABELS, EMOTION_LABELS } from "../../types/labels";

const log = createLogger("parser");

// Regex short-circuit — avoids an LLM call for the most obvious non-guidance inputs
const GREETING_RE = /^(hi+|hello+|hey+|howdy|greetings|sup|yo|good\s+(morning|afternoon|evening|day))[\s!?.]*$/i;
const META_RE = /^(what|who|tell me about|describe)\s+(are\s+you|is\s+this|do\s+you\s+do|can\s+you\s+do)[\s!?.]*$/i;

function regexShortCircuit(message: string): QueryType | null {
  const trimmed = message.trim();
  if (GREETING_RE.test(trimmed)) return "greeting";
  if (META_RE.test(trimmed)) return "meta";
  return null;
}

const SYSTEM_PROMPT = `You are a diagnostic parser for a Buddhist guidance system. Your job is to analyze a user's message and extract structured information.

First, classify the message type in the "query_type" field:
- "guidance": The user is describing a personal problem, struggle, emotion, or situation and wants Buddhist-informed help. This is the most common type.
- "concept": The user is asking a factual or doctrinal question about Buddhist teachings, terminology, or concepts (e.g. "What is the Noble Eightfold Path?", "What are the Three Characteristics of Existence?", "Explain dependent origination", "What are the five aggregates?", "What is nibbana?"). Use this for knowledge questions, not personal struggles.
- "meta": The user is asking about what this system is, what it does, or how it works (e.g. "what are you?", "how do you work?", "what can you help with?").
- "greeting": A simple greeting or opener with no specific problem yet (e.g. "hello", "hi there", "good morning").
- "off_topic": The message is unrelated to personal guidance or Buddhist practice (e.g. weather, coding questions, news).

Then fill in the remaining fields. For non-"guidance" types, use empty arrays for labels and "low" for urgency.

Output a JSON object with these fields:
- "query_type": one of "guidance", "concept", "meta", "greeting", "off_topic"
- "user_situation": A concise 1-2 sentence summary of the user's real-life problem. Use "N/A" for non-guidance queries.
- "emotion_labels": An array of emotion labels from this set: ${JSON.stringify(EMOTION_LABELS)}. Pick 1-3 that best match. Empty array for non-guidance.
- "buddhist_labels": An array of Buddhist diagnostic labels from this set: ${JSON.stringify(BUDDHIST_LABELS)}. Pick 1-3 that best match. Empty array for non-guidance.
- "urgency": One of "low", "medium", "high", or "crisis". Use "crisis" only for self-harm or immediate danger. Default "low" for non-guidance.
- "intent": What the user seems to want.
- "tone_needed": What tone the response should have.

Be practical and grounded. Do not over-interpret.`;

export async function parseQuery(message: string): Promise<ParsedQuery> {
  log.info("Parsing user query", { messageLength: message.length });

  // Fast path: skip the LLM call for obvious greetings and meta questions
  const shortCircuit = regexShortCircuit(message);
  if (shortCircuit) {
    log.debug("Short-circuit parse", { queryType: shortCircuit });
    return {
      query_type: shortCircuit,
      user_situation: "N/A",
      emotion_labels: [],
      buddhist_labels: [],
      urgency: "low",
      intent: shortCircuit === "greeting" ? "opening a conversation" : "asking about the system",
      tone_needed: "warm and welcoming",
    };
  }

  try {
    const parsed = await callLLMJson<ParsedQuery>(SYSTEM_PROMPT, message);

    log.debug("Parse result", {
      queryType: parsed.query_type,
      emotionLabels: parsed.emotion_labels,
      emotionLabelCount: parsed.emotion_labels.length,
      buddhistLabels: parsed.buddhist_labels,
      buddhistLabelCount: parsed.buddhist_labels.length,
      urgency: parsed.urgency,
      intent: parsed.intent,
      toneNeeded: parsed.tone_needed,
    });

    return parsed;
  } catch (error) {
    log.error("Parse failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}