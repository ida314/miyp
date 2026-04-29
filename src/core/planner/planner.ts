import { callLLMJson } from "../../utils/llm";
import { createLogger } from "../../utils/logger";
import { ParsedQuery } from "../../types/parsedQuery";
import { AdviceUnit } from "../../types/adviceUnit";
import { ResponsePlan } from "../../types/responsePlan";

const log = createLogger("planner");

const SYSTEM_PROMPT = `You are a response planner for a Buddhist guidance system. Given a user's diagnosed situation and a set of retrieved Buddhist advice units, produce a structured response plan.

You must output a JSON object with these fields:
- "main_issue": A concise summary of the core issue the response should address.
- "selected_sources": An array of source references (e.g., "AN 5.57") from the provided advice units that are most relevant. Pick 1-3.
- "key_teaching_points": An array of 2-4 key teaching points drawn from the retrieved advice units. These must be grounded in the provided sources.
- "recommended_actions": An array of 2-4 practical next steps the user can take. These must be synthesized from the practice_actions in the retrieved advice units.
- "tone": A short description of the appropriate tone for the response (e.g., "plain, grounded, non-performative").

Rules:
- Do NOT introduce teachings that are not supported by the retrieved advice units.
- Do NOT be preachy or theatrical. Be practical and grounded.
- Prioritize actionable guidance over doctrinal explanation.
- If the advice units don't clearly address the user's issue, note that honestly rather than stretching.`;

export async function planResponse(
  parsedQuery: ParsedQuery,
  topUnits: AdviceUnit[]
): Promise<ResponsePlan> {
  log.info("Planning response", {
    issue: parsedQuery.user_situation,
    unitCount: topUnits.length,
  });

  const unitsContext = topUnits
    .map(
      (u, i) =>
        `[Unit ${i + 1}] Source: ${u.source_ref}
Problem: ${u.problem_summary}
Diagnosis: ${u.diagnosis}
Teaching: ${u.teaching}
Practice Actions: ${u.practice_actions.join("; ")}
Labels: ${u.buddhist_labels.join(", ")}`
    )
    .join("\n\n");

  const userMessage = `User situation: ${parsedQuery.user_situation}
User emotions: ${parsedQuery.emotion_labels.join(", ")}
Buddhist labels: ${parsedQuery.buddhist_labels.join(", ")}
User intent: ${parsedQuery.intent}
Desired tone: ${parsedQuery.tone_needed}

Retrieved Advice Units:
${unitsContext}`;

  try {
    const plan = await callLLMJson<ResponsePlan>(SYSTEM_PROMPT, userMessage);

    log.debug("Response plan created", {
      mainIssue: plan.main_issue,
      sources: plan.selected_sources,
      teachingPoints: plan.key_teaching_points.length,
      actions: plan.recommended_actions.length,
    });

    return plan;
  } catch (error) {
    log.error("Planning failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
