import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import { typeSafeClient } from "../../shared/libs/typesafe.js";
import { choice } from "@typesafe-ai/sdk";


export const AdaptiveStrategySchema = z.object({
  strategy: z.enum([
    "DIRECT_ANSWER",      
    "BROAD_SUMMARY",     
    "COMPLEX_DECOMPOSE", 
    "FACTUAL_SPECIFIC",  
  ]),
  reasoning: z
    .string()
    .describe("Brief 1-sentence rationale for the routing decision"),
  shouldRetrieve: z
    .boolean()
    .describe("false ONLY for chit-chat, greetings, or pure questions not needing docs"),
});

// 2. Deterministic configuration mapping for each strategy
const STRATEGY_CONFIGS = {
  DIRECT_ANSWER: {
    kCandidate: 0,
    topN: 0,
    useHyde: false,
    decompose: false,
    preferParentChunks: false,
  },
  BROAD_SUMMARY: {
    kCandidate: 50,          // High K to span broad sections of documents
    topN: 16,                // Larger generation window for comprehensive summary
    useHyde: false,          // Summaries need broad coverage, not single-point HyDE
    decompose: false,
    preferParentChunks: true,// Prioritize larger parent paragraphs
  },
  COMPLEX_DECOMPOSE: {
    kCandidate: 40,
    topN: 10,
    useHyde: true,
    decompose: true,         // Triggers decomposition into sub-questions
    preferParentChunks: false,
  },
  FACTUAL_SPECIFIC: {
    kCandidate: 30,
    topN: 8,
    useHyde: true,           // HyDE aids pinpointing precise factual answers
    decompose: false,
    preferParentChunks: false,
  },
};

// 3. Agent definition using OpenAI Agents SDK with structured output
const adaptiveRouterAgent = new Agent({
  name: "adaptive-router",
  model: "gpt-4.1-mini",
  outputType: AdaptiveStrategySchema,
  instructions: `You are an intelligent query routing engine for an AI research notebook system.
Analyze the user's latest query along with any prior conversation history to choose the optimal retrieval strategy:

1. DIRECT_ANSWER:
   - Greetings (e.g. "hi", "hello", "good morning"), casual chit-chat, gratitude ("thanks!"), or identity questions ("who are you?").
   - Pure math or generic questions completely unrelated to user documents ("what is 2+2?", "tell me a joke").
   - shouldRetrieve MUST be false.

2. BROAD_SUMMARY:
   - High-level overview requests across documents (e.g. "summarize this source", "what are the main themes?", "give me an outline/executive brief").
   - shouldRetrieve MUST be true.

3. COMPLEX_DECOMPOSE:
   - Multi-part queries (e.g. "explain X, and compare it with Y"), comparative questions, or multi-hop questions requiring synthesis of disparate sections.
   - shouldRetrieve MUST be true.

4. FACTUAL_SPECIFIC:
   - Specific lookups, questions seeking concrete facts, metrics, definitions, quotes, or answers located in particular sections.
   - Also use this for ambiguous follow-up questions referencing earlier discussions (e.g. "Why?", "What happened next?", "Can you expand?").
   - shouldRetrieve MUST be true.`,
});

/**
 * Routes user queries adaptively using the OpenAI Agent SDK.
 * @param {string} question - The user query.
 * @param {Array} conversationHistory - Prior chat messages [{ role, content }].
 * @returns {Promise<Object>} The classification and tuned retrieval parameters.
 */
export async function routeAdaptiveStrategy(question, conversationHistory = []) {
  if (!question || !question.trim()) {
    return {
      strategy: "DIRECT_ANSWER",
      reasoning: "Empty query",
      shouldRetrieve: false,
      ...STRATEGY_CONFIGS.DIRECT_ANSWER,
    };
  }

  // Format recent turns so the agent can resolve pronoun/follow-up references
  let historyContext = "";
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-4);
    historyContext = recent
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");
  }

  const prompt = historyContext
    ? `Conversation History:\n${historyContext}\n\nCurrent Question: ${question}`
    : `Current Question: ${question}`;

  // 1. Try TypeSafe System One (Jev) for sub-100ms deterministic classification
  if (typeSafeClient) {
    try {
      const response = await typeSafeClient.systemOne({
        state: {
          conversation_history: historyContext || "None",
          user_question: question,
        },
        questions: {
          strategy: choice(
            "Classify the user's research query into the single most appropriate retrieval strategy based on intent and scope.",
            {
              DIRECT_ANSWER:
                "Casual greetings, pleasantries, gratitude, identity queries, or general chit-chat not referencing documents",
              BROAD_SUMMARY:
                "Requests for comprehensive document summaries, high-level overviews, main themes, or executive outlines",
              COMPLEX_DECOMPOSE:
                "Compound multi-part questions, comparative queries, or multi-hop synthesis across distinct sections",
              FACTUAL_SPECIFIC:
                "Specific factual lookups, definitions, metrics, quotes, code snippets, or localized document questions",
            }
          ),
        },
      });

      const selected = response.answers.strategy?.choice;
      const confidence = response.answers.strategy?.confidence;
      if (selected && STRATEGY_CONFIGS[selected]) {
        const config = STRATEGY_CONFIGS[selected];
        return {
          strategy: selected,
          reasoning: `TypeSafe Jev System One (confidence: ${confidence})`,
          shouldRetrieve: selected !== "DIRECT_ANSWER",
          ...config,
        };
      }
    } catch (err) {
      console.warn("⚠️ TypeSafe strategy routing failed, falling back to agent SDK:", err.message);
    }
  }

  // 2. Fallback to Agent SDK runner
  try {
    const result = await run(adaptiveRouterAgent, prompt);
    const classification = result.finalOutput;
    const config =
      STRATEGY_CONFIGS[classification.strategy] ||
      STRATEGY_CONFIGS.FACTUAL_SPECIFIC;

    return {
      strategy: classification.strategy,
      reasoning: classification.reasoning,
      shouldRetrieve: classification.shouldRetrieve,
      ...config,
    };
  } catch (error) {
    console.error("Adaptive router fallback due to error:", error);
    // Safe graceful fallback: Default to factual retrieval so the user is never blocked
    return {
      strategy: "FACTUAL_SPECIFIC",
      reasoning: "Router fallback",
      shouldRetrieve: true,
      ...STRATEGY_CONFIGS.FACTUAL_SPECIFIC,
    };
  }
}
