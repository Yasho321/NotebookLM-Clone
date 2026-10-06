import "dotenv/config";
import mongoose from "mongoose";
import { Agent, run } from "@openai/agents";
import Chat from "../../shared/models/chat.model.js";
import Source from "../../shared/models/source.model.js";
import {
  enqueueChatSummaryIfNeeded,
  enqueueMemoryExtractionIfNeeded,
  formatChatContextWithSummary,
} from "../utils/chatContext.js";
import { fetchOptimizedMemory } from "../utils/fetchMemory.js";
import { retrievalPipeline } from "../retrieval/pipeline.js";
import { createTraceSession } from "../utils/traceMiddleware.js";

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Agent SDK Chat Agent definition
// ─────────────────────────────────────────────────────────────────────────────
const chatAssistantAgent = new Agent({
  name: "chithhi-chat-agent",
  model: "gpt-4.1-mini",
  instructions: `You are Chithhi, an AI research assistant analyzing documents and pair-programming with the user.
Answer the user's questions clearly, accurately, and strictly grounded in the provided document evidence and personal context.

Citations & Grounding:
- Cite evidence inline using the passage NUMBER in square brackets, e.g. [1] or [2]. The number must match the "Source Passage N" label of the passage you used. Cite multiple with [1][3].
- Place the citation right after the sentence or claim it supports. Only cite passages you actually used.
- If multiple sources are referenced, attribute each fact to its respective passage number.
- Do not invent citations or make claims unsupported by the evidence.
- If the retrieval engine indicates that context was insufficient (shouldRefuse), politely explain: "I couldn't find enough information in your sources to answer this question." You may then offer general knowledge with an explicit disclaimer.
- Maintain a helpful, analytical, and professional tone with Markdown bullets and formatting where appropriate.`,
});

// ─────────────────────────────────────────────────────────────────────────────
// In-memory registry of active SSE streams keyed by "userId:chatId"
// Used by the /stop endpoint to abort in-flight generation.
// ─────────────────────────────────────────────────────────────────────────────
const activeStreams = new Map();

/**
 * Builds the full prompt from memory, retrieval, and conversation context.
 * Extracted as a shared helper so both createMessage and regenerateMessage can reuse it.
 *
 * @param {string} message - The user's question
 * @param {string} userId - User ID
 * @param {string[]} activeSources - Array of source IDs to search
 * @param {Array} previousHistory - Prior messages
 * @param {string|null} rollingSummary - Compressed rolling summary
 * @param {object|null} trace - Optional trace session for observability
 * @returns {Promise<{ prompt: string, citations: Array, retrievalResult: object }>}
 */
async function buildPrompt(
  message,
  userId,
  activeSources,
  previousHistory,
  rollingSummary,
  trace = null,
  memoryPromise = null
) {
  // 1. Concurrently execute optimized memory fetch + modular retrieval pipeline
  const tMemStart = Date.now();
  const memoryTask = Promise.resolve(memoryPromise || fetchOptimizedMemory(message, userId)).then(
    (data) => {
      if (trace) trace.setStepDuration("memoryMs", Date.now() - tMemStart);
      return data;
    }
  );

  const tRetStart = Date.now();
  const retrievalTask = retrievalPipeline(
    message,
    activeSources,
    userId,
    previousHistory
  ).then((result) => {
    if (trace) {
      trace.setStepDuration("retrievalMs", Date.now() - tRetStart);
      trace.setRetrievalMetrics(result.metadata);
    }
    return result;
  });

  const [memoryData, retrievalResult] = await Promise.all([
    memoryTask,
    retrievalTask,
  ]);

  const { userContext, factsText } = memoryData;

  // 2. Format source context & build structured citations
  let sourceEvidenceText = "";
  let citations = [];

  if (retrievalResult.docs && retrievalResult.docs.length > 0) {
    // Sort by source filename then page number for coherent reading order
    const sortedDocs = [...retrievalResult.docs].sort((a, b) => {
      const sourceA = a.metadata?.originalFileName || "";
      const sourceB = b.metadata?.originalFileName || "";
      if (sourceA !== sourceB) return sourceA.localeCompare(sourceB);
      const pageA = a.metadata?.pageNumber || 0;
      const pageB = b.metadata?.pageNumber || 0;
      return pageA - pageB;
    });

    sourceEvidenceText = sortedDocs
      .map((doc, idx) => {
        const file = doc.metadata?.originalFileName || "Document";
        const page = doc.metadata?.pageNumber ? ` (Page ${doc.metadata.pageNumber})` : "";
        const content = doc.content || doc.pageContent || "";
        return `[Source Passage ${idx + 1}: ${file}${page}]\n${content}`;
      })
      .join("\n\n---\n\n");

    citations = sortedDocs.map((doc) => ({
      sourceId:
        doc.sourceId && mongoose.Types.ObjectId.isValid(doc.sourceId)
          ? doc.sourceId
          : null,
      originalFileName: doc.metadata?.originalFileName || "Document",
      pageNumber: doc.metadata?.pageNumber || 1,
      chunkId:
        doc.chunkId && mongoose.Types.ObjectId.isValid(doc.chunkId)
          ? doc.chunkId
          : null,
      snippet: (doc.content || doc.pageContent || "").slice(0, 200),
    }));
  } else if (retrievalResult.strategy === "DIRECT_ANSWER") {
    sourceEvidenceText = "Direct conversational query — no document retrieval needed.";
  } else {
    sourceEvidenceText = "No relevant source passages found in the selected documents.";
  }

  if (trace) {
    trace.addEvent("pipeline:result", {
      strategy: retrievalResult.strategy,
      shouldRefuse: retrievalResult.shouldRefuse,
      candidateCount: retrievalResult.docs?.length || 0,
      evidenceSummary: sourceEvidenceText.slice(0, 500),
    });
  }

  // Graduated grounding enforcement based on CRAG confidence score
  const gradeScore = retrievalResult.grade?.score ?? 7;
  let groundingDirective = "";
  if (retrievalResult.strategy !== "DIRECT_ANSWER") {
    if (gradeScore >= 7) {
      groundingDirective = "GROUNDING: HIGH CONFIDENCE — Evidence is comprehensive. Answer directly from sources with inline citations.";
    } else if (gradeScore >= 4) {
      groundingDirective = "GROUNDING: PARTIAL EVIDENCE — Some relevant passages found but gaps exist. Clearly distinguish between what the sources say vs. what you are inferring. Use phrases like 'Based on the available sources...' and explicitly note where the documents do not cover the question.";
    } else {
      groundingDirective = "GROUNDING: LOW CONFIDENCE — Very limited evidence found. State what little the sources say, then explicitly note the information gap. Do not fill in missing facts with general knowledge unless you clearly label it as such.";
    }
  }

  // 3. Layer 1 Context Pruning: Combine rolling summary with last 50 messages
  const { recentMessages, summaryPromptBlock } = formatChatContextWithSummary(
    previousHistory,
    rollingSummary,
    { maxRecentTurns: 50 }
  );

  const formattedDialogue = recentMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const prompt = `
${summaryPromptBlock}
USER FACTS (Persistent Profile):
${factsText || "None recorded"}

USER EPISODIC & GRAPH CONTEXT:
${userContext || "None recorded"}

${groundingDirective ? `${groundingDirective}\n` : ""}RETRIEVED DOCUMENT EVIDENCE (${retrievalResult.strategy}):
${sourceEvidenceText}
${retrievalResult.shouldRefuse ? "\nNOTE: Retrieval confidence is below threshold (< 3). Please inform the user that sources lack this information.\n" : ""}
RECENT CONVERSATION (Last 50 turns):
${formattedDialogue || "No previous turns"}

USER QUESTION:
${message}
    `.trim();

  return { prompt, citations, retrievalResult };
}

/**
 * Streams an agent response to the client via SSE.
 * Handles AbortController, error recovery, and cleanup.
 *
 * @param {object} res - Express response object
 * @param {string} prompt - Full prompt to send to agent
 * @param {AbortController} abortController - Controller for cancellation
 * @returns {Promise<string>} The full accumulated response text
 */
async function streamAgentResponse(res, prompt, abortController) {
  let fullText = "";

  // Run the agent in streaming mode, passing the AbortSignal
  const streamResult = await run(chatAssistantAgent, prompt, {
    stream: true,
    signal: abortController.signal,
  });

  // Get text stream of deltas
  const textStream = streamResult.toTextStream();

  // Pipe text chunks as SSE events
  for await (const chunk of textStream) {
    // If aborted mid-stream, stop sending
    if (abortController.signal.aborted) {
      break;
    }

    const token = typeof chunk === 'string'
      ? chunk
      : Buffer.isBuffer(chunk)
        ? chunk.toString('utf-8')
        : String(chunk || '');

    if (token) {
      fullText += token;
      res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
    }
  }

  return fullText;
}

/**
 * Finds the chat by ID and validates ownership.
 * Returns the chat document or sends a 404 and returns null.
 *
 * @param {string} chatId - Chat document ID
 * @param {string} userId - Authenticated user ID
 * @param {object} res - Express response object
 * @returns {Promise<object|null>} Chat document or null if not found/unauthorized
 */
async function findChatOrFail(chatId, userId, res) {
  if (!chatId) {
    res.status(400).json({ success: false, message: "Missing chatId" });
    return null;
  }

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404).json({ success: false, message: "Chat not found" });
    return null;
  }

  if (chat.userId.toString() !== userId.toString()) {
    res.status(403).json({ success: false, message: "Not authorized to access this chat" });
    return null;
  }

  return chat;
}

/**
 * Sets standard SSE headers and flushes them.
 * @param {object} res - Express response object
 */
function setSSEHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering (nginx)
  res.flushHeaders();
}

// ─────────────────────────────────────────────────────────────────────────────
// POST / — Create a new chat with selected sources
// ─────────────────────────────────────────────────────────────────────────────
export const createChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sourceIds, title } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Not Authorized" });
    }

    const uniqueSourceIds = [
      ...new Set(
        (Array.isArray(sourceIds) ? sourceIds : [])
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
          .map((id) => id.toString())
      ),
    ];

    if (uniqueSourceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one valid sourceId is required",
      });
    }

    // Validate that all sourceIds exist and belong to this user
    const sources = await Source.find({
      _id: { $in: uniqueSourceIds },
      userId,
    }).select("_id title originalFileName type");

    if (sources.length !== uniqueSourceIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more source IDs are invalid or don't belong to you",
      });
    }

    const chat = await Chat.create({
      userId,
      sourceIds: uniqueSourceIds,
      title: title || null,
    });

    return res.status(201).json({
      success: true,
      message: "Chat created",
      chat: {
        _id: chat._id,
        sourceIds: chat.sourceIds,
        title: chat.title,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
      sources, // Return source metadata so frontend can display them
    });
  } catch (error) {
    console.error("❌ Error in createChat:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create chat",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET / — List all chats for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────
export const listChats = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Not Authorized" });
    }

    const chats = await Chat.find({ userId })
      .select("sourceIds title createdAt updatedAt pinned isReadOnly")
      .populate("sourceIds", "title originalFileName type status")
      // Pinned chats float to the top; within each group, most recently updated first.
      .sort({ pinned: -1, updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      chats,
      message: "Chats fetched",
    });
  } catch (error) {
    console.error("❌ Error in listChats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to list chats",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /:chatId/message — Send a message (SSE streaming)
// ─────────────────────────────────────────────────────────────────────────────
export const createMessage = async (req, res) => {
  const abortController = new AbortController();
  let streamKey = null;
  let trace = null;
  let fullText = "";

  try {
    const userId = req.user._id;
    const { chatId } = req.params;
    const { message } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Not Authorized" });
    }

    if (!message) {
      return res.status(400).json({ success: false, message: "No message provided" });
    }

    // ── Early Memory Retrieval Dispatch (runs concurrently with chat DB validation) ──
    const memoryPromise = fetchOptimizedMemory(message, userId, req.user?.facts);

    // ── Find and validate chat ownership ─────────────────────────────────
    const chat = await findChatOrFail(chatId, userId, res);
    if (!chat) return; // Response already sent by findChatOrFail

    if (chat.isReadOnly || !chat.sourceIds?.length) {
      return res.status(403).json({
        success: false,
        message: "This dialogue is read-only because all of its sources were removed.",
      });
    }

    const activeSources = chat.sourceIds;
    const previousHistory = chat.messages || [];

    // ── Start Execution Trace Session ───────────────────────────────────
    trace = createTraceSession(userId, chatId, message);

    // ── Set SSE headers ──────────────────────────────────────────────────
    setSSEHeaders(res);

    // ── Register abort on client disconnect ──────────────────────────────
    streamKey = `${userId}:${chatId}`;
    activeStreams.set(streamKey, abortController);

    req.on("close", () => {
      abortController.abort();
      activeStreams.delete(streamKey);
    });

    // ── Build the full prompt ────────────────────────────────────────────
    const { prompt, citations, retrievalResult } = await buildPrompt(
      message,
      userId,
      activeSources,
      previousHistory,
      chat.rollingSummary,
      trace,
      memoryPromise
    );

    // ── Send retrieval metadata as first SSE event (including traceId) ───
    res.write(
      `data: ${JSON.stringify({
        type: "metadata",
        traceId: trace.traceId,
        retrievalMetadata: retrievalResult.metadata,
        citations,
      })}\n\n`
    );

    // ── Stream the agent response token-by-token ─────────────────────────
    const tGenStart = Date.now();
    fullText = await streamAgentResponse(res, prompt, abortController);
    trace.setStepDuration("generationMs", Date.now() - tGenStart);

    const refinedRes = fullText.trim();

    // ── Persist messages to DB atomically ────────────────────────────────
    const userMsg = { role: "user", content: message };
    const assistantMsg = { role: "assistant", content: refinedRes, citations, traceId: trace?.traceId || null };

    // Auto-title the chat from the first user message so the sidebar isn't full of
    // "Untitled Dialogue". Only on the very first exchange, and only if untitled.
    const isFirstExchange = (chat.messages?.length || 0) === 0;
    const setFields = { updatedAt: new Date() };
    if (isFirstExchange && !chat.title) {
      const derived = message.trim().replace(/\s+/g, " ").slice(0, 60);
      setFields.title = derived + (message.trim().length > 60 ? "…" : "");
      chat.title = setFields.title;
    }

    chat.messages.push(userMsg);
    chat.messages.push(assistantMsg);

    await Chat.findByIdAndUpdate(chat._id, {
      $push: { messages: { $each: [userMsg, assistantMsg] } },
      $set: setFields,
    });

    // ── Asynchronously complete execution trace in background ────────────
    trace.complete({ response: refinedRes });

    // ── Fire-and-forget background workers ───────────────────────────────
    enqueueMemoryExtractionIfNeeded(chat, userId).catch((err) =>
      console.error("Failed to enqueue memory extraction:", err)
    );
    enqueueChatSummaryIfNeeded(chat, userId).catch((err) =>
      console.error("Failed to enqueue chat summary:", err)
    );

    // ── Send completion event and end stream ─────────────────────────────
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        traceId: trace.traceId,
        fullResponse: refinedRes,
        citations,
        messages: chat.messages,
      })}\n\n`
    );
    res.end();
  } catch (error) {
    if (trace) {
      trace.complete({ response: fullText || "", error });
    }

    // If the stream was aborted intentionally (stop generation), send a clean stop event
    if (abortController.signal.aborted) {
      try {
        res.write(
          `data: ${JSON.stringify({ type: "stopped", message: "Generation stopped by user" })}\n\n`
        );
        res.end();
      } catch {
        // Response may already be closed
      }
      return;
    }

    console.error("❌ Error in createMessage:", error);

    // If headers already sent (SSE mode), send error as SSE event
    if (res.headersSent) {
      try {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
        );
        res.end();
      } catch {
        // Response may already be closed
      }
    } else {
      return res.status(500).json({
        success: false,
        message: "Internal error while chatting",
        error: error.message,
      });
    }
  } finally {
    // Cleanup: remove from active streams
    if (streamKey) {
      activeStreams.delete(streamKey);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /:chatId/stop — Stop in-flight generation
// ─────────────────────────────────────────────────────────────────────────────
export const stopGeneration = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    if (!userId || !chatId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId or chatId",
      });
    }

    const streamKey = `${userId}:${chatId}`;
    const controller = activeStreams.get(streamKey);

    if (controller) {
      controller.abort();
      activeStreams.delete(streamKey);

      // The SSE handler's catch block will handle sending the "stopped" event
      return res.status(200).json({
        success: true,
        message: "Generation stopped",
      });
    }

    return res.status(200).json({
      success: true,
      message: "No active generation to stop",
    });
  } catch (error) {
    console.error("❌ Error in stopGeneration:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to stop generation",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /:chatId/regenerate — Remove last assistant message and re-generate
// ─────────────────────────────────────────────────────────────────────────────
export const regenerateMessage = async (req, res) => {
  const abortController = new AbortController();
  let streamKey = null;
  let trace = null;
  let fullText = "";

  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Not Authorized" });
    }

    // ── Find and validate chat ownership ─────────────────────────────────
    const chat = await findChatOrFail(chatId, userId, res);
    if (!chat) return;

    if (chat.isReadOnly || !chat.sourceIds?.length) {
      return res.status(403).json({
        success: false,
        message: "This dialogue is read-only because all of its sources were removed.",
      });
    }

    if (!chat.messages || chat.messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No chat history found to regenerate",
      });
    }

    // Find the last assistant message and the user message before it
    const messages = chat.messages;
    let lastAssistantIdx = -1;
    let lastUserMessage = null;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && lastAssistantIdx === -1) {
        lastAssistantIdx = i;
      }
      if (messages[i].role === "user" && lastAssistantIdx !== -1) {
        lastUserMessage = messages[i].content;
        break;
      }
    }

    if (lastAssistantIdx === -1 || !lastUserMessage) {
      return res.status(400).json({
        success: false,
        message: "No assistant message to regenerate",
      });
    }

    // Remove the last assistant message from the array
    messages.splice(lastAssistantIdx, 1);
    await chat.save();

    const activeSources = chat.sourceIds;

    // ── Start Execution Trace Session ───────────────────────────────────
    trace = createTraceSession(userId, chatId, `[Regenerate] ${lastUserMessage}`);

    // ── Set SSE headers ──────────────────────────────────────────────────
    setSSEHeaders(res);

    // ── Register abort on client disconnect ──────────────────────────────
    streamKey = `${userId}:${chatId}`;
    activeStreams.set(streamKey, abortController);

    req.on("close", () => {
      abortController.abort();
      activeStreams.delete(streamKey);
    });

    const previousHistory = chat.messages || [];

    // ── Build the full prompt using the original user message ─────────────
    const { prompt, citations, retrievalResult } = await buildPrompt(
      lastUserMessage,
      userId,
      activeSources,
      previousHistory,
      chat.rollingSummary,
      trace
    );

    // ── Send retrieval metadata (including traceId) ──────────────────────
    res.write(
      `data: ${JSON.stringify({
        type: "metadata",
        traceId: trace.traceId,
        retrievalMetadata: retrievalResult.metadata,
        citations,
      })}\n\n`
    );

    // ── Stream the regenerated response ──────────────────────────────────
    const tGenStart = Date.now();
    fullText = await streamAgentResponse(res, prompt, abortController);
    trace.setStepDuration("generationMs", Date.now() - tGenStart);

    const refinedRes = fullText.trim();

    // ── Persist the new assistant message atomically ──────────────────────
    const assistantMsg = { role: "assistant", content: refinedRes, citations, traceId: trace?.traceId || null };
    chat.messages.push(assistantMsg);

    await Chat.findByIdAndUpdate(chat._id, {
      $push: { messages: assistantMsg },
      $set: { updatedAt: new Date() },
    });

    // ── Asynchronously complete execution trace in background ────────────
    trace.complete({ response: refinedRes });

    // ── Fire-and-forget background workers ───────────────────────────────
    enqueueMemoryExtractionIfNeeded(chat, userId).catch((err) =>
      console.error("Failed to enqueue memory extraction:", err)
    );
    enqueueChatSummaryIfNeeded(chat, userId).catch((err) =>
      console.error("Failed to enqueue chat summary:", err)
    );

    // ── Send completion event ────────────────────────────────────────────
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        traceId: trace.traceId,
        fullResponse: refinedRes,
        citations,
        messages: chat.messages,
      })}\n\n`
    );
    res.end();
  } catch (error) {
    if (trace) {
      trace.complete({ response: fullText || "", error });
    }

    if (abortController.signal.aborted) {
      try {
        res.write(
          `data: ${JSON.stringify({ type: "stopped", message: "Regeneration stopped by user" })}\n\n`
        );
        res.end();
      } catch {
        // Response may already be closed
      }
      return;
    }

    console.error("❌ Error in regenerateMessage:", error);

    if (res.headersSent) {
      try {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`
        );
        res.end();
      } catch {
        // Response may already be closed
      }
    } else {
      return res.status(500).json({
        success: false,
        message: "Internal error while regenerating",
        error: error.message,
      });
    }
  } finally {
    if (streamKey) {
      activeStreams.delete(streamKey);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /:chatId/save-partial — Save a partial response after stop
// Allows the frontend to persist what was streamed before the user stopped.
// ─────────────────────────────────────────────────────────────────────────────
export const savePartialResponse = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;
    const { userMessage, partialResponse, citations } = req.body;

    if (!userId || !chatId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId or chatId",
      });
    }

    if (!userMessage || !partialResponse) {
      return res.status(400).json({
        success: false,
        message: "Missing userMessage or partialResponse",
      });
    }

    const chat = await findChatOrFail(chatId, userId, res);
    if (!chat) return;

    const msgsToPush = [];
    const lastUserMsg = [...chat.messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg || lastUserMsg.content !== userMessage) {
      const uMsg = { role: "user", content: userMessage };
      chat.messages.push(uMsg);
      msgsToPush.push(uMsg);
    }

    const cleanCitations = Array.isArray(citations)
      ? citations.map((c) => ({
          sourceId:
            c.sourceId && mongoose.Types.ObjectId.isValid(c.sourceId)
              ? c.sourceId
              : null,
          originalFileName: c.originalFileName || "Document",
          pageNumber: c.pageNumber || 1,
          chunkId:
            c.chunkId && mongoose.Types.ObjectId.isValid(c.chunkId)
              ? c.chunkId
              : null,
          snippet: (c.snippet || "").slice(0, 200),
        }))
      : [];

    const aMsg = {
      role: "assistant",
      content: partialResponse,
      citations: cleanCitations,
    };
    chat.messages.push(aMsg);
    msgsToPush.push(aMsg);

    if (msgsToPush.length > 0) {
      await Chat.findByIdAndUpdate(chat._id, {
        $push: { messages: { $each: msgsToPush } },
        $set: { updatedAt: new Date() },
      });
    }

    // ── Fire-and-forget background workers ───────────────────────────────
    enqueueMemoryExtractionIfNeeded(chat, userId).catch((err) =>
      console.error("Failed to enqueue memory extraction:", err)
    );
    enqueueChatSummaryIfNeeded(chat, userId).catch((err) =>
      console.error("Failed to enqueue chat summary:", err)
    );

    return res.status(200).json({
      success: true,
      message: "Partial response saved",
      messages: chat.messages,
    });
  } catch (error) {
    console.error("❌ Error in savePartialResponse:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save partial response",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /:chatId — Fetch a single chat with full message history
// ─────────────────────────────────────────────────────────────────────────────
export const getChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Not Authorized" });
    }

    const chat = await Chat.findOne({ _id: chatId, userId })
      .populate("sourceIds", "title originalFileName type status")
      .lean();

    if (!chat) {
      return res.status(404).json({ success: false, message: "Chat not found" });
    }

    const rawMessages = chat.messages || [];

    // Ensure each message strictly includes its own citations
    const messages = rawMessages.map((m) => ({
      ...m,
      citations: Array.isArray(m.citations) ? m.citations : [],
    }));

    return res.status(200).json({
      success: true,
      chat,
      messages,
      message: "Chat fetched",
    });
  } catch (error) {
    console.error("❌ Error in getChat:", error);
    return res.status(500).json({
      success: false,
      message: "Internal error while fetching chat",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:chatId — Rename a chat
// ─────────────────────────────────────────────────────────────────────────────
export const renameChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;
    const { title } = req.body;

    const chat = await findChatOrFail(chatId, userId, res);
    if (!chat) return; // response already sent

    const newTitle = title.trim();
    // Targeted update (NOT chat.save()) so we don't re-validate the whole document —
    // a legacy message with empty content would otherwise fail validation and 500.
    await Chat.updateOne({ _id: chatId, userId }, { $set: { title: newTitle } });

    return res.status(200).json({
      success: true,
      message: "Chat renamed",
      chat: { _id: chatId, title: newTitle },
    });
  } catch (error) {
    console.error("❌ Error in renameChat:", error);
    return res.status(500).json({
      success: false,
      message: "Internal error while renaming chat",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:chatId — Delete a chat (and abort any in-flight generation for it)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    const chat = await findChatOrFail(chatId, userId, res);
    if (!chat) return; // response already sent

    // If this chat is mid-stream, abort it so we don't write to a deleted doc.
    const streamKey = `${userId}:${chatId}`;
    const controller = activeStreams.get(streamKey);
    if (controller) {
      controller.abort();
      activeStreams.delete(streamKey);
    }

    await Chat.deleteOne({ _id: chatId, userId });

    return res.status(200).json({
      success: true,
      message: "Chat deleted",
      chatId,
    });
  } catch (error) {
    console.error("❌ Error in deleteChat:", error);
    return res.status(500).json({
      success: false,
      message: "Internal error while deleting chat",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:chatId/pin — Toggle pin state of a chat
// ─────────────────────────────────────────────────────────────────────────────
export const togglePinChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    const chat = await findChatOrFail(chatId, userId, res);
    if (!chat) return; // response already sent

    const pinned = !chat.pinned;
    // Targeted update to avoid re-validating embedded messages (see renameChat).
    await Chat.updateOne({ _id: chatId, userId }, { $set: { pinned } });

    return res.status(200).json({
      success: true,
      message: pinned ? "Chat pinned" : "Chat unpinned",
      chat: { _id: chatId, pinned },
    });
  } catch (error) {
    console.error("❌ Error in togglePinChat:", error);
    return res.status(500).json({
      success: false,
      message: "Internal error while pinning chat",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /:chatId/feedback — Rate an assistant message (👍/👎). Toggles off if re-sent.
// ─────────────────────────────────────────────────────────────────────────────
export const setMessageFeedback = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;
    const { messageIndex, rating } = req.body;

    if (rating !== "up" && rating !== "down") {
      return res.status(400).json({ success: false, message: "rating must be 'up' or 'down'" });
    }

    const chat = await findChatOrFail(chatId, userId, res);
    if (!chat) return;

    const idx = Number(messageIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= chat.messages.length) {
      return res.status(400).json({ success: false, message: "Invalid message index" });
    }
    if (chat.messages[idx].role !== "assistant") {
      return res.status(400).json({ success: false, message: "Only assistant messages can be rated" });
    }

    // Toggle: re-submitting the same rating clears it.
    const next = chat.messages[idx].feedback === rating ? null : rating;
    await Chat.updateOne(
      { _id: chatId, userId },
      { $set: { [`messages.${idx}.feedback`]: next } }
    );

    return res.status(200).json({ success: true, message: "Feedback saved", messageIndex: idx, feedback: next });
  } catch (error) {
    console.error("❌ Error in setMessageFeedback:", error);
    return res.status(500).json({ success: false, message: "Internal error while saving feedback" });
  }
};
