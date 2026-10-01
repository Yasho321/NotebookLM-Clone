import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import Chat from "../../shared/models/chat.model.js";

// 1. Define Zod schema for structured context compression
export const ChatSummarySchema = z.object({
  rollingSummary: z
    .string()
    .describe(
      "Dense, high-entropy rolling synthesis of the conversation. Shrinks context by ~80% while strictly preserving the critical 1% facts, decisions, metrics, and user preferences."
    ),
  keyTopics: z
    .array(z.string())
    .describe("List of core topics, entities, and document references"),
  tokenReductionEstimate: z
    .string()
    .describe("Estimated token reduction ratio, e.g. '~80%'"),
});

// 2. Define the Agent SDK Chat Context Summarizer Agent
const chatSummarizerAgent = new Agent({
  name: "chat-context-compressor",
  model: "gpt-4.1-nano",
  outputType: ChatSummarySchema,
  instructions: `You are an expert conversation context compression engine for an AI research notebook platform.
Your job is to implement Intelligent Pruning: shrink the conversational message volume by ~80% while ruthlessly preserving the critical 1% of essential facts, user goals, and conclusions needed to answer future chat questions.

Core Requirements:
1. CONTINUITY & CONTEXT PRESERVATION:
   - If an existing rolling summary is provided, you MUST merge and synthesize the new conversation batch into it.
   - NEVER lose historical context, user preferences, or previously established facts.

2. AGGRESSIVE PRUNING (Drop the 80% noise):
   - Strip all pleasantries ("hello", "thanks", "how can I help you"), conversational filler, greetings, and boilerplate.
   - Drop trial-and-error intermediate conversational turns if a definitive answer was reached.

3. PRESERVE THE CRITICAL 10% NEEDED FOR RETRIEVAL & REASONING:
   - User Intent & Questions: What goals and topics is the user exploring?
   - Specific Ground Truths: Precise numbers, dates, formulas, error codes, URLs, file names, page citations, and technical terms.
   - User Constraints & Directives: Any preferences, corrections, or specific styling requested by the user.

4. OUTPUT FORMAT:
   - Output a clean, compact Markdown bulleted summary with headings:
     * **Core Topics & Objectives**
     * **Key Established Facts & Decisions**
     * **User Directives & Preferences**
   - Keep it concise, high-signal, and factual.`,
});

/**
 * BullMQ worker processor for summarizing 30-message conversation batches.
 * Updates the `rollingSummary` field of the Chat document in MongoDB without losing prior context.
 *
 * @param {object} job - BullMQ job containing { chatId, messages, messageCount }
 * @returns {Promise<{ success: boolean, chatId: string, summaryLength: number }>}
 */
export async function processChatSummary(job) {
  const { chatId, messages = [], messageCount } = job.data;

  if (!chatId) {
    throw new Error("[chatSummaryProcessor] Missing chatId in job data");
  }

  // Fetch the current chat document from MongoDB
  const chat = await Chat.findById(chatId);
  if (!chat) {
    console.warn(`⚠️ [chatSummaryProcessor] Chat not found: ${chatId}`);
    return { success: false, reason: "Chat not found" };
  }

  const existingSummary = chat.rollingSummary || "";

  // Format the 30-message batch into a clean dialogue log
  const formattedBatch = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const prompt = existingSummary
    ? `EXISTING ROLLING SUMMARY (DO NOT LOSE THIS HISTORICAL CONTEXT):\n${existingSummary}\n\nNEW CONVERSATION TURNS TO COMPRESS & MERGE (BATCH OF ${messages.length} MESSAGES):\n${formattedBatch}`
    : `CONVERSATION TURNS TO COMPRESS (BATCH OF ${messages.length} MESSAGES):\n${formattedBatch}`;

  try {
    const result = await run(chatSummarizerAgent, prompt);
    const { rollingSummary } = result.finalOutput;

    // Atomically persist the updated rollingSummary in MongoDB without risking race conditions
    await Chat.findByIdAndUpdate(chatId, { $set: { rollingSummary } });

    console.log(
      `✅ [chatSummaryProcessor] Updated rollingSummary for Chat ${chatId} at ${messageCount || messages.length} messages.`
    );

    return {
      success: true,
      chatId,
      summaryLength: rollingSummary.length,
    };
  } catch (error) {
    console.error(
      `❌ [chatSummaryProcessor] Summarization failed for chat ${chatId}:`,
      error
    );
    throw error;
  }
}
