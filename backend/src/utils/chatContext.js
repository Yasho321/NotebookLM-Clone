import "dotenv/config";
import { Queue } from "bullmq";

/**
 * BullMQ Queue instance for background chat context compression
 */
export const chatSummaryQueue = new Queue("chat-summary", {
  connection: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  },
});

/**
 * Checks if the chat has accumulated a 30-message batch and queues a background summarization job.
 * Runs fire-and-forget so user message streaming latency is never blocked.
 *
 * @param {object} chat - Mongoose Chat document
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Whether a job was enqueued
 */
export async function enqueueChatSummaryIfNeeded(chat, userId) {
  if (!chat || !Array.isArray(chat.messages) || chat.messages.length === 0) {
    return false;
  }

  const messageCount = chat.messages.length;

  // Trigger strictly after every 30 messages (30, 60, 90, etc.)
  if (messageCount % 30 === 0) {
    const batchToSummarize = chat.messages.slice(-30);
    const jobId = `summary-${chat._id.toString()}-${messageCount}`;

    try {
      await chatSummaryQueue.add(
        "summarize-chat",
        {
          chatId: chat._id.toString(),
          userId: userId?.toString(),
          sourceIds: chat.sourceIds?.map((id) => id.toString()),
          messages: batchToSummarize,
          messageCount,
        },
        {
          jobId, // Prevents duplicate jobs for the same 30-message milestone
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      console.log(
        `📬 [ChatContext] Enqueued chat-summary job for Chat ${chat._id} at message ${messageCount}`
      );
      return true;
    } catch (err) {
      console.error("❌ Failed to enqueue chat summary job:", err);
      return false;
    }
  }

  return false;
}

/**
 * BullMQ Queue instance for background long-term memory extraction (factual & episodic)
 */
export const memoryExtractionQueue = new Queue("memory-extraction", {
  connection: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  },
});

/**
 * Checks if the chat has accumulated a 40-message batch and queues background long-term memory extraction.
 * Extracts both factual (MongoDB) and episodic (Neo4j + Qdrant) memories in batch.
 *
 * @param {object} chat - Mongoose Chat document
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Whether a job was enqueued
 */
export async function enqueueMemoryExtractionIfNeeded(chat, userId) {
  if (!chat || !Array.isArray(chat.messages) || chat.messages.length === 0) {
    return false;
  }

  const messageCount = chat.messages.length;

  // Trigger strictly after every 40 messages (40, 80, 120, etc.)
  if (messageCount % 40 === 0) {
    const batchToAnalyze = chat.messages.slice(-40);
    const jobId = `memory-${chat._id.toString()}-${messageCount}`;

    try {
      await memoryExtractionQueue.add(
        "extract-memory",
        {
          chatId: chat._id.toString(),
          userId: userId?.toString(),
          messages: batchToAnalyze,
          messageCount,
        },
        {
          jobId, // Prevents duplicate jobs for the same 40-message milestone
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      console.log(
        `🧠 [MemoryContext] Enqueued memory-extraction job for User ${userId} at message ${messageCount}`
      );
      return true;
    } catch (err) {
      console.error("❌ Failed to enqueue memory extraction job:", err);
      return false;
    }
  }

  return false;
}

/**
 * Prepares the conversation turns for prompt generation by combining the
 * persisted rolling summary with the most recent verbatim turns (Layer 1 context pruning).
 *
 * When a rolling summary exists, it covers messages up to the last summarization batch
 * boundary (multiples of 30). To avoid redundant overlap, we only include verbatim
 * messages that are NOT yet covered by the summary.
 *
 * @param {Array<object>} messages - Full list of chat messages
 * @param {string|null} rollingSummary - Persisted summary from MongoDB
 * @param {object} [options]
 * @param {number} [options.maxRecentTurns=50] - Max number of recent turns to keep verbatim
 * @param {number} [options.summaryBatchSize=30] - Batch size used by chatSummaryProcessor
 * @returns {{ recentMessages: Array<object>, summaryPromptBlock: string }}
 */
export function formatChatContextWithSummary(
  messages = [],
  rollingSummary = null,
  { maxRecentTurns = 50, summaryBatchSize = 30 } = {}
) {
  let recentMessages;

  if (rollingSummary && messages.length > summaryBatchSize) {
    // Summary covers up to the most recent completed batch boundary.
    // e.g., at 75 messages with batchSize=30, summary covers messages 0-59 (batches at 30 and 60).
    // Only send messages 60+ verbatim to avoid overlap.
    const completedBatches = Math.floor(messages.length / summaryBatchSize);
    const lastSummarizedIndex = completedBatches * summaryBatchSize;
    recentMessages = messages.slice(lastSummarizedIndex);
  } else {
    // No summary yet or message count is small — send last N turns
    recentMessages = messages.slice(-maxRecentTurns);
  }

  const summaryPromptBlock = rollingSummary
    ? `[PREVIOUS CONVERSATION ROLLING SUMMARY - CRITICAL FACTS TO PRESERVE]\n${rollingSummary}\n[END CONVERSATION SUMMARY]\n\n`
    : "";

  return {
    recentMessages,
    summaryPromptBlock,
  };
}
