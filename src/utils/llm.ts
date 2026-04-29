import OpenAI from "openai";
import { createLogger } from "./logger";

const log = createLogger("llm");

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

/**
 * Call the LLM with a system prompt and user message.
 * Returns the raw string content from the model.
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  options: LLMOptions = {}
): Promise<string> {
  const {
    model = "gpt-4o",
    temperature = 0.3,
    maxTokens = 2048,
    responseFormat = "text",
  } = options;

  log.debug("Calling LLM", {
    model,
    temperature,
    maxTokens,
    systemPromptLength: systemPrompt.length,
    userMessageLength: userMessage.length,
  });

  try {
    const response = await getClient().chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      response_format:
        responseFormat === "json" ? { type: "json_object" } : { type: "text" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";
    log.debug("LLM response received", {
      responseLength: content.length,
      finishReason: response.choices[0]?.finish_reason,
    });

    return content;
  } catch (error) {
    log.error("LLM call failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Generate an embedding vector for the given text using text-embedding-3-small.
 */
export async function embedText(text: string): Promise<number[]> {
  log.debug("Generating embedding", { textLength: text.length });

  try {
    const response = await getClient().embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    });
    return response.data[0].embedding;
  } catch (error) {
    log.error("Embedding failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Call the LLM with streaming. Calls onToken for each chunk; returns full text.
 */
export async function callLLMStream(
  systemPrompt: string,
  userMessage: string,
  onToken: (token: string) => void,
  options: LLMOptions = {}
): Promise<string> {
  const {
    model = "gpt-4o",
    temperature = 0.3,
    maxTokens = 2048,
  } = options;

  log.debug("Calling LLM (stream)", { model, temperature, maxTokens });

  try {
    const stream = await getClient().chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    let full = "";
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (token) {
        onToken(token);
        full += token;
      }
    }
    log.debug("LLM stream complete", { responseLength: full.length });
    return full;
  } catch (error) {
    log.error("LLM stream failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Call the LLM and parse the response as JSON.
 */
export async function callLLMJson<T>(
  systemPrompt: string,
  userMessage: string,
  options: LLMOptions = {}
): Promise<T> {
  const raw = await callLLM(systemPrompt, userMessage, {
    ...options,
    responseFormat: "json",
  });

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    log.error("Failed to parse LLM JSON response", { raw: raw.slice(0, 500) });
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
