import { Router, Request, Response } from "express";
import { handleChat, handleChatStream } from "../core/handleChat";
import { createLogger } from "../utils/logger";

const log = createLogger("chatRoute");
const router = Router();

/**
 * POST /chat/respond
 * Main chat endpoint per the design doc API sketch.
 */
router.post("/respond", async (req: Request, res: Response) => {
  const { message, session_id } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required and must be a string" });
    return;
  }

  const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || "1000", 10);
  if (message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Message too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.` });
    return;
  }

  const sessionId = session_id || "anonymous";

  log.info("Chat request received", { sessionId, messageLength: message.length });

  try {
    const response = await handleChat(message, sessionId);
    res.json(response);
  } catch (error) {
    log.error("Chat request failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /chat/stream
 * Server-sent events endpoint. Emits status, token, done, and error events.
 */
router.post("/stream", async (req: Request, res: Response) => {
  const { message, session_id } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required and must be a string" });
    return;
  }

  const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || "1000", 10);
  if (message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Message too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.` });
    return;
  }

  const sessionId = session_id || "anonymous";
  log.info("Chat stream request received", { sessionId, messageLength: message.length });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await handleChatStream(message, sessionId, {
      onStatus: (text) => send({ type: "status", text }),
      onToken: (token) => send({ type: "token", text: token }),
      onDone: (meta) => {
        send({ type: "done", ...meta });
        res.end();
      },
    });
  } catch (error) {
    log.error("Chat stream failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    send({ type: "error", text: "Something went wrong. Please try again." });
    res.end();
  }
});

export default router;
