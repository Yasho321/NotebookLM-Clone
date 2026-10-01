import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";

// 1. Define Zod schema for structured query translations
export const QueryTranslationSchema = z.object({
  rewrite: z
    .string()
    .describe(
      "A standalone question resolving all pronouns, ambiguous references, and context from previous conversation."
    ),
  stepBack: z
    .string()
    .describe(
      "A broader, high-level conceptual question that captures the fundamental principles or background behind the user's question."
    ),
  subQuestions: z
    .array(z.string())
    .max(3)
    .describe(
      "Up to 2 independent, atomic sub-questions if the query is compound or multi-part. If the question is simple, return an empty array."
    ),
  hyde: z
    .string()
    .describe(
      "A concise 1-2 sentence hypothetical answer excerpt (max 30 words) with key technical terms. Used as embedding search key."
    ),
});

// 2. Define the Query Translator Agent (Fast Nano model)
const queryTranslatorAgent = new Agent({
  name: "query-translator",
  model: "gpt-4.1-nano",
  outputType: QueryTranslationSchema,
  instructions: `You are an ultra-fast retrieval query analysis engine for an advanced RAG system.
Given the user's question and recent conversation history, generate:

1. rewrite:
   - Make the question standalone, resolving pronouns ('it', 'that', 'this') from history.
   - If already standalone, keep it unchanged.

2. stepBack:
   - 1 higher-level conceptual query capturing core principles.

3. subQuestions:
   - If compound, up to 2 atomic sub-questions; else [].

4. hyde:
   - Concise 1-2 sentence (max 30 words) factual excerpt with domain terminology. Never write long essays.`,
});

/**
 * Translates a user query into multiple search vectors (original, rewrite, step-back, sub-questions, HyDE).
 * @param {string} question - The raw user question.
 * @param {Array} conversationHistory - Prior conversation messages [{ role, content }].
 * @returns {Promise<Object>} Object containing all query variants and a deduplicated allQueries list.
 */
export async function translateQuery(question, conversationHistory = []) {
  if (!question || !question.trim()) {
    return {
      original: "",
      rewrite: "",
      stepBack: "",
      subQuestions: [],
      hyde: "",
      allQueries: [],
    };
  }

  // Format recent turns for contextual resolution
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

  try {
    const result = await run(queryTranslatorAgent, prompt);
    const translation = result.finalOutput;

    // Collect all text search candidates and deduplicate identical strings
    const candidates = [
      question.trim(),
      translation.rewrite?.trim(),
      translation.stepBack?.trim(),
      ...(translation.subQuestions || []).map((q) => q.trim()),
    ];

    // Filter out empty strings and remove duplicates
    const uniqueQueries = candidates.filter(
      (q, idx, self) => q && self.indexOf(q) === idx
    );

    return {
      original: question, // Rule: NEVER drop the original user question
      rewrite: translation.rewrite,
      stepBack: translation.stepBack,
      subQuestions: translation.subQuestions || [],
      hyde: translation.hyde,
      allQueries: uniqueQueries,
    };
  } catch (error) {
    console.error("Query translation failed, falling back to original:", error);
    // Graceful fallback: If translation fails, search with the original query
    return {
      original: question,
      rewrite: question,
      stepBack: question,
      subQuestions: [],
      hyde: question,
      allQueries: [question],
    };
  }
}
