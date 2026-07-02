import { callLLM, callLLMStream, ConversationMessage } from "../../utils/llm";
import { createLogger } from "../../utils/logger";
import { ResponsePlan } from "../../types/responsePlan";

const log = createLogger("writer");

const META_SYSTEM_PROMPT = `You are Monk in Your Pocket — a tool that brings early Buddhist teachings close at hand for everyday struggles. You draw on teachings from the Pāli Canon (Aṅguttara Nikāya, Majjhima Nikāya, Saṁyutta Nikāya). You are not a monk, a therapist, or a replacement for a teacher.

If the user is asking about a previous response (sources used, concepts mentioned, advice given), answer specifically from the conversation history provided. Be concise — 50–200 words.`;

export async function writeMetaResponse(question: string, history: ConversationMessage[]): Promise<string> {
  log.info("Writing meta response with history");
  try {
    const response = await callLLM(META_SYSTEM_PROMPT, question, {
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 512,
      history,
    });
    return response.trim();
  } catch (error) {
    log.error("Meta writing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function writeMetaResponseStream(
  question: string,
  history: ConversationMessage[],
  onToken: (token: string) => void
): Promise<string> {
  log.info("Writing meta response with history (stream)");
  try {
    const full = await callLLMStream(META_SYSTEM_PROMPT, question, onToken, {
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 512,
      history,
    });
    return full.trim();
  } catch (error) {
    log.error("Meta stream writing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const CONCEPT_SYSTEM_PROMPT = `You are a knowledgeable and clear-headed teacher of early Buddhist doctrine (Theravada / Pāli Canon). A student has asked a doctrinal or conceptual question. Explain the concept accurately and accessibly.

Guidelines:
- Explain the concept in plain modern language. Define Pāli terms when you use them.
- Ground explanations in the early suttas (Aṅguttara Nikāya, Majjhima Nikāya, Saṁyutta Nikāya, Dhammapada) and cite specific references where you can (e.g. "MN 9", "AN 3.136").
- Be honest about complexity — if a concept is contested or has nuance, say so briefly.
- Keep it practical: connect the concept to everyday experience where natural.
- Do not be preachy or over-formal. Write as a thoughtful teacher, not a textbook.
- Aim for 150–300 words. Use paragraphs, not bullet lists for the main body.
- Do not claim to be a monk or authoritative teacher.`;

export async function writeConceptResponse(question: string, history: ConversationMessage[] = []): Promise<string> {
  log.info("Writing concept response");
  try {
    const response = await callLLM(CONCEPT_SYSTEM_PROMPT, question, {
      temperature: 0.4,
      maxTokens: 1024,
      history,
    });
    return response.trim();
  } catch (error) {
    log.error("Concept writing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function writeConceptResponseStream(
  question: string,
  onToken: (token: string) => void,
  history: ConversationMessage[] = []
): Promise<string> {
  log.info("Writing concept response (stream)");
  try {
    const full = await callLLMStream(CONCEPT_SYSTEM_PROMPT, question, onToken, {
      temperature: 0.4,
      maxTokens: 1024,
      history,
    });
    return full.trim();
  } catch (error) {
    log.error("Concept stream writing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const GUIDANCE_SYSTEM_PROMPT = `You are a compassionate Buddhist guidance writer. Given a structured response plan with source-grounded teachings, write a warm, practical, and honest response to the user.

Writing guidelines:
- Address the user directly and naturally. Do not use "Dear seeker" or similar formalities.
- Explain the Buddhist framing in plain, modern language. Avoid jargon unless you explain it.
- Give 2-4 practical next steps the user can actually try.
- Cite the source references naturally (e.g., "In the Aṅguttara Nikāya (AN 5.162)...").
- Be honest when the guidance is interpretive rather than a direct quote from a text.
- Do not be preachy, performative, or theatrical. Be genuine and direct.
- Do not claim to be a monk, teacher, or therapist.
- Keep the response focused — aim for 150-300 words.
- Use paragraphs, not bullet lists for the main body. Action steps can be a short list at the end.
- End with an encouraging but honest note — not a platitude.`;

export async function writeResponse(plan: ResponsePlan, history: ConversationMessage[] = []): Promise<string> {
  log.info("Writing response", {
    sources: plan.selected_sources,
    sourceCount: plan.selected_sources.length,
    tone: plan.tone,
    teachingPoints: plan.key_teaching_points.length,
    actions: plan.recommended_actions.length,
  });

  const userMessage = `Response Plan:
Main issue: ${plan.main_issue}
Sources to cite: ${plan.selected_sources.join(", ")}
Key teaching points:
${plan.key_teaching_points.map((p) => `- ${p}`).join("\n")}
Recommended actions:
${plan.recommended_actions.map((a) => `- ${a}`).join("\n")}
Tone: ${plan.tone}

Write the response now.`;

  try {
    const response = await callLLM(GUIDANCE_SYSTEM_PROMPT, userMessage, {
      temperature: 0.5,
      maxTokens: 1024,
      history,
    });

    log.info("Response written", { responseLength: response.length });
    return response.trim();
  } catch (error) {
    log.error("Writing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function writeResponseStream(
  plan: ResponsePlan,
  onToken: (token: string) => void,
  history: ConversationMessage[] = []
): Promise<string> {
  log.info("Writing response (stream)", {
    sources: plan.selected_sources,
    sourceCount: plan.selected_sources.length,
    tone: plan.tone,
    teachingPoints: plan.key_teaching_points.length,
    actions: plan.recommended_actions.length,
  });

  const userMessage = `Response Plan:
Main issue: ${plan.main_issue}
Sources to cite: ${plan.selected_sources.join(", ")}
Key teaching points:
${plan.key_teaching_points.map((p) => `- ${p}`).join("\n")}
Recommended actions:
${plan.recommended_actions.map((a) => `- ${a}`).join("\n")}
Tone: ${plan.tone}

Write the response now.`;

  try {
    const full = await callLLMStream(GUIDANCE_SYSTEM_PROMPT, userMessage, onToken, {
      temperature: 0.5,
      maxTokens: 1024,
      history,
    });
    return full.trim();
  } catch (error) {
    log.error("Stream writing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
