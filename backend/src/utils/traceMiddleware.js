import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { addTraceProcessor } from "@openai/agents";

// BullMQ Queue instance for asynchronous trace persistence in worker
export const traceQueue = new Queue("trace-logging", {
  connection: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  },
});

/**
 * Global custom trace processor for @openai/agents
 * Collects runtime SDK agent spans and traces.
 */
class AgentSDKTraceCollector {
  async onTraceStart(trace) {
    // Optional: hook into SDK trace lifecycle
  }

  async onTraceEnd(trace) {
    // When an agent trace ends, we can capture raw events if needed
  }

  async onSpanStart(span) {}

  async onSpanEnd(span) {}

  async shutdown() {}

  async forceFlush() {}
}

// Register with global agents SDK trace provider
try {
  addTraceProcessor(new AgentSDKTraceCollector());
} catch (err) {
  console.warn("⚠️ Could not register AgentSDKTraceCollector:", err.message);
}

/**
 * Creates an execution trace session for a chat turn or pipeline query.
 *
 * @param {string} userId - User ID
 * @param {string|null} chatId - Chat ID
 * @param {string} query - The user prompt
 * @returns {object} Trace session tracker
 */
export function createTraceSession(userId, chatId, query) {
  const traceId = `trace-${uuidv4()}`;
  const startTime = Date.now();
  const events = [];
  const stepDurations = {};
  let retrievalMetrics = {};

  // Record initial event
  events.push({
    name: "trace:start",
    timestamp: new Date().toISOString(),
    query,
    userId: userId?.toString(),
    chatId: chatId?.toString(),
  });

  return {
    traceId,
    userId,
    chatId,
    query,
    startTime,

    /**
     * Records a milestone or intermediate event in the trace.
     */
    addEvent(name, data = {}) {
      events.push({
        name,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startTime,
        ...data,
      });
    },

    /**
     * Records granular step durations.
     */
    setStepDuration(stepName, durationMs) {
      stepDurations[stepName] = durationMs;
    },

    /**
     * Sets retrieval-specific metrics extracted from retrievalPipeline.metadata.
     */
    setRetrievalMetrics(meta = {}) {
      retrievalMetrics = {
        strategy: meta.strategy || null,
        queryVariantsGenerated: meta.queryVariants?.length || 0,
        channelsSearched: Array.isArray(meta.channels) ? meta.channels : [],
        chunksRetrieved: meta.candidateCount || meta.totalChannelsRetrieved || 0,
        chunksAfterFloor: meta.afterFloorCount || 0,
        chunksAfterRerank: meta.afterRerankCount || 0,
        contextGradeScore: meta.gradeScore ?? null,
        correctiveRetries: meta.attempts || 0,
        refused: meta.refused || false,
        selectedChunkIds: meta.finalSelectedCount ? [] : [],
      };

      if (meta.timings) {
        Object.assign(stepDurations, meta.timings);
      }
    },

    /**
     * Completes the trace and enqueues it to BullMQ for background worker persistence.
     * Guaranteed zero-blocking: Redis queue addition executes in the background.
     */
    complete({ response = "", tokenUsage = {}, error = null } = {}) {
      const totalDuration = Date.now() - startTime;

      events.push({
        name: error ? "trace:error" : "trace:complete",
        timestamp: new Date().toISOString(),
        durationMs: totalDuration,
        error: error ? (error.message || String(error)) : null,
      });

      const safeResponse =
        typeof response === "string" ? response.slice(0, 5000) : "";

      // Fire-and-forget job enqueue to BullMQ
      traceQueue
        .add(
          "persist-trace",
          {
            traceId,
            userId: userId ? userId.toString() : null,
            chatId: chatId ? chatId.toString() : null,
            query,
            response: safeResponse,
            events,
            duration: totalDuration,
            stepDurations,
            tokenUsage: {
              promptTokens: tokenUsage?.promptTokens || 0,
              completionTokens: tokenUsage?.completionTokens || 0,
              totalTokens: tokenUsage?.totalTokens || 0,
            },
            error: error ? (error.message || String(error)) : null,
            retrievalMetrics,
          },
          {
            removeOnComplete: true,
            removeOnFail: 500,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
          }
        )
        .catch((err) => {
          console.error("⚠️ Failed to enqueue trace to BullMQ:", err.message);
        });

      return {
        traceId,
        duration: totalDuration,
      };
    },
  };
}
