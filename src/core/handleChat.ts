import { createLogger } from "../utils/logger";
import { ChatResponse } from "../types/chatResponse";
import { checkSafety } from "./safety/safetyCheck";
import { parseQuery } from "./parser/parseQuery";
import { classify } from "./classifier/classify";
import { retrieveAdvice } from "./retrival/retriveAdvice";
import { rerank } from "./rerank/reranker";
import { planResponse } from "./planner/planner";
import { writeResponse, writeResponseStream, writeConceptResponse, writeConceptResponseStream, writeMetaResponse, writeMetaResponseStream } from "./writer/writer";
import { appendToHistory, getHistory } from "./sessionStore";

const log = createLogger("handleChat");

const META_RESPONSE = `I'm Monk in Your Pocket — a tool that brings early Buddhist teachings close at hand for everyday struggles.

I can help you work through challenges like anger, anxiety, grief, relationship difficulties, doubt, craving, and restlessness, by drawing on teachings from the Pāli Canon (Aṅguttara Nikāya, Majjhima Nikāya, Saṁyutta Nikāya). Every response cites the specific sutta it draws from so you can trace the source.

I'm not a monk, a therapist, or a replacement for a teacher. Just 2,500 years of practical wisdom, close at hand.

What's on your mind?`;

const GREETING_RESPONSE = `Hello. I'm here to help. What's going on for you today?`;

const OFF_TOPIC_RESPONSE = `I'm designed specifically to offer guidance grounded in early Buddhist teachings. I'm best suited for questions about everyday challenges — things like anger, anxiety, grief, difficult relationships, doubt, or the struggle to build better habits.

Is there something along those lines I can help with?`;

export interface StreamCallbacks {
  onStatus: (text: string) => void;
  onToken: (token: string) => void;
  onDone: (meta: { citations: { source_ref: string }[]; diagnostic_labels: string[]; safety_flags: string[] }) => void;
}

/**
 * Streaming variant of handleChat. Sends status events during pipeline stages,
 * then streams writer tokens. Calls onDone with citations/labels at the end.
 */
export async function handleChatStream(
  message: string,
  sessionId: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const { onStatus, onToken, onDone } = callbacks;

  log.info("Handling chat message (stream)", { sessionId, messageLength: message.length });

  const safety = checkSafety(message);
  if (!safety.isSafe) {
    log.warn("Safety redirect triggered", { sessionId, flags: safety.flags });
    for (const ch of safety.redirectMessage!) onToken(ch);
    onDone({ citations: [], diagnostic_labels: [], safety_flags: safety.flags });
    return;
  }

  onStatus("Reflecting on your message…");
  const history = getHistory(sessionId);
  const parsedQuery = await parseQuery(message, history);

  if (parsedQuery.query_type === "meta") {
    if (history.length === 0) {
      appendToHistory(sessionId, message, META_RESPONSE);
      for (const ch of META_RESPONSE) onToken(ch);
      onDone({ citations: [], diagnostic_labels: [], safety_flags: [] });
    } else {
      const answer = await writeMetaResponseStream(message, history, onToken);
      appendToHistory(sessionId, message, answer);
      onDone({ citations: [], diagnostic_labels: [], safety_flags: [] });
    }
    return;
  }
  if (parsedQuery.query_type === "greeting") {
    appendToHistory(sessionId, message, GREETING_RESPONSE);
    for (const ch of GREETING_RESPONSE) onToken(ch);
    onDone({ citations: [], diagnostic_labels: [], safety_flags: [] });
    return;
  }
  if (parsedQuery.query_type === "off_topic") {
    appendToHistory(sessionId, message, OFF_TOPIC_RESPONSE);
    for (const ch of OFF_TOPIC_RESPONSE) onToken(ch);
    onDone({ citations: [], diagnostic_labels: [], safety_flags: [] });
    return;
  }
  if (parsedQuery.query_type === "concept") {
    onStatus("Drawing on the teachings…");
    const answer = await writeConceptResponseStream(message, onToken, history);
    appendToHistory(sessionId, message, answer);
    onDone({ citations: [], diagnostic_labels: [], safety_flags: [] });
    return;
  }

  onStatus("Searching the canon…");
  const classification = classify(parsedQuery, message);

  if (classification.isCrisis) {
    const crisisSafety = checkSafety("suicide");
    for (const ch of crisisSafety.redirectMessage!) onToken(ch);
    onDone({ citations: [], diagnostic_labels: classification.parsedQuery.buddhist_labels, safety_flags: classification.safetyFlags });
    return;
  }

  const candidates = await retrieveAdvice(classification.parsedQuery);
  const topUnits = rerank(candidates, classification.parsedQuery, 5);

  if (topUnits.length === 0) {
    const fallback = "I appreciate you sharing this with me. Unfortunately, I don't have specific teachings in my current collection that directly address your situation. I'd encourage you to explore the early Buddhist suttas — particularly the Aṅguttara Nikāya — or speak with a knowledgeable teacher who can offer more tailored guidance.";
    appendToHistory(sessionId, message, fallback);
    for (const ch of fallback) onToken(ch);
    onDone({ citations: [], diagnostic_labels: classification.parsedQuery.buddhist_labels, safety_flags: [] });
    return;
  }

  onStatus("Drawing on the teachings…");
  const plan = await planResponse(classification.parsedQuery, topUnits);

  onStatus("Writing…");
  const guidanceAnswer = await writeResponseStream(plan, onToken, history);

  const citations = plan.selected_sources.map((ref) => ({ source_ref: ref }));
  appendToHistory(sessionId, message, guidanceAnswer);
  onDone({ citations, diagnostic_labels: classification.parsedQuery.buddhist_labels, safety_flags: [] });
}

/**
 * Main chat orchestrator. Runs the full workflow:
 * safety → parse → [branch on query_type] → classify → retrieve → rerank → plan → write → response
 */
export async function handleChat(
  message: string,
  sessionId: string
): Promise<ChatResponse> {
  log.info("Handling chat message", {
    sessionId,
    messageLength: message.length,
  });

  // Step 1: Safety check (runs before any LLM calls)
  const safety = checkSafety(message);
  if (!safety.isSafe) {
    log.warn("Safety redirect triggered", { sessionId, flags: safety.flags });
    return {
      answer: safety.redirectMessage!,
      citations: [],
      diagnostic_labels: [],
      safety_flags: safety.flags,
    };
  }

  // Step 2: Parse the user query (includes query_type classification)
  const history = getHistory(sessionId);
  const parsedQuery = await parseQuery(message, history);

  // Step 3: Branch on query type — only "guidance" proceeds to retrieval
  if (parsedQuery.query_type === "meta") {
    log.info("Meta query — returning direct response", { sessionId });
    if (history.length === 0) {
      appendToHistory(sessionId, message, META_RESPONSE);
      return { answer: META_RESPONSE, citations: [], diagnostic_labels: [], safety_flags: [] };
    }
    const answer = await writeMetaResponse(message, history);
    appendToHistory(sessionId, message, answer);
    return { answer, citations: [], diagnostic_labels: [], safety_flags: [] };
  }
  if (parsedQuery.query_type === "greeting") {
    log.info("Greeting — returning direct response", { sessionId });
    appendToHistory(sessionId, message, GREETING_RESPONSE);
    return { answer: GREETING_RESPONSE, citations: [], diagnostic_labels: [], safety_flags: [] };
  }
  if (parsedQuery.query_type === "off_topic") {
    log.info("Off-topic query — returning redirect", { sessionId });
    appendToHistory(sessionId, message, OFF_TOPIC_RESPONSE);
    return { answer: OFF_TOPIC_RESPONSE, citations: [], diagnostic_labels: [], safety_flags: [] };
  }
  if (parsedQuery.query_type === "concept") {
    log.info("Concept query — writing doctrinal explanation", { sessionId });
    const answer = await writeConceptResponse(message, history);
    appendToHistory(sessionId, message, answer);
    return { answer, citations: [], diagnostic_labels: [], safety_flags: [] };
  }

  // Step 4: Classify and validate labels
  const classification = classify(parsedQuery, message);

  // If crisis was detected during classification but not in pre-check
  if (classification.isCrisis) {
    const crisisSafety = checkSafety("suicide"); // force crisis redirect
    return {
      answer: crisisSafety.redirectMessage!,
      citations: [],
      diagnostic_labels: classification.parsedQuery.buddhist_labels,
      safety_flags: classification.safetyFlags,
    };
  }

  // Step 5: Retrieve candidate advice units
  const candidates = await retrieveAdvice(classification.parsedQuery);

  // Step 6: Rerank candidates
  const topUnits = rerank(candidates, classification.parsedQuery, 5);

  if (topUnits.length === 0) {
    log.warn("No advice units found", { sessionId });
    const fallback = "I appreciate you sharing this with me. Unfortunately, I don't have specific teachings in my current collection that directly address your situation. I'd encourage you to explore the early Buddhist suttas — particularly the Aṅguttara Nikāya — or speak with a knowledgeable teacher who can offer more tailored guidance.";
    appendToHistory(sessionId, message, fallback);
    return {
      answer: fallback,
      citations: [],
      diagnostic_labels: classification.parsedQuery.buddhist_labels,
      safety_flags: [],
    };
  }

  // Step 7: Plan the response
  const plan = await planResponse(classification.parsedQuery, topUnits);

  // Step 8: Write the final response
  const answer = await writeResponse(plan, history);

  const citations = plan.selected_sources.map((ref) => ({
    source_ref: ref,
  }));

  appendToHistory(sessionId, message, answer);

  log.info("Chat response complete", {
    sessionId,
    queryType: classification.parsedQuery.query_type,
    urgency: classification.parsedQuery.urgency,
    buddhistLabels: classification.parsedQuery.buddhist_labels,
    citationCount: citations.length,
    answerLength: answer.length,
    isCrisis: classification.isCrisis,
  });

  return {
    answer,
    citations,
    diagnostic_labels: classification.parsedQuery.buddhist_labels,
    safety_flags: [],
  };
}
