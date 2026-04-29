import { createLogger } from "../../utils/logger";
import { CRISIS_KEYWORDS } from "../../types/labels";

const log = createLogger("safety");

export interface SafetyResult {
  isSafe: boolean;
  flags: string[];
  redirectMessage: string | null;
}

const CRISIS_REDIRECT_MESSAGE = `I can hear that you're going through something really painful right now. What you're feeling matters, and you deserve support from someone who can truly help.

Please reach out to one of these resources:
• **988 Suicide & Crisis Lifeline**: Call or text 988 (US)
• **Crisis Text Line**: Text HOME to 741741
• **International Association for Suicide Prevention**: https://www.iasp.info/resources/Crisis_Centres/

These services are free, confidential, and available 24/7. You don't have to face this alone.

I'm an AI guidance tool grounded in Buddhist teachings, and while I can offer reflections on many of life's challenges, this is a moment where a trained human counselor can help in ways I cannot.`;

/**
 * First-pass safety check on the raw user message.
 * This runs BEFORE any LLM calls to catch obvious crisis indicators early.
 */
export function checkSafety(message: string): SafetyResult {
  const lower = message.toLowerCase();
  const flags: string[] = [];

  // Check for crisis keywords
  for (const keyword of CRISIS_KEYWORDS) {
    if (lower.includes(keyword)) {
      flags.push(`crisis_keyword: ${keyword}`);
    }
  }

  if (flags.length > 0) {
    log.warn("Safety check triggered", { flags });
    return {
      isSafe: false,
      flags,
      redirectMessage: CRISIS_REDIRECT_MESSAGE,
    };
  }

  log.debug("Safety check passed");
  return {
    isSafe: true,
    flags: [],
    redirectMessage: null,
  };
}
