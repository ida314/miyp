import { ConversationMessage } from "../utils/llm";

const MAX_MESSAGES = 8; // 4 turns (user + assistant per turn)

const store = new Map<string, ConversationMessage[]>();

export function appendToHistory(sessionId: string, userMessage: string, assistantResponse: string): void {
  const history = store.get(sessionId) ?? [];
  history.push({ role: "user", content: userMessage });
  history.push({ role: "assistant", content: assistantResponse });
  if (history.length > MAX_MESSAGES) {
    history.splice(0, history.length - MAX_MESSAGES);
  }
  store.set(sessionId, history);
}

export function getHistory(sessionId: string): ConversationMessage[] {
  return store.get(sessionId) ?? [];
}
