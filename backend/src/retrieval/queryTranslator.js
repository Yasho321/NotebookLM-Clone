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
      "Up to 3 independent, atomic sub-questions if the query is compound or multi-part. If the question is simple, return an empty array."
    ),
  hyde: z
    .string()
    .describe(
      "A hypothetical passage (100-150 words) written as if it were a direct, factual answer from a document. Used exclusively as an embedding search key."
    ),
});

// 2. Define the Query Translator Agent
const queryTranslatorAgent = new Agent({
  name: "query-translator",
  model: "gpt-4.1-mini",
  outputType: QueryTranslationSchema,
  instructions: `You are an expert retrieval query analysis and translation engine for an advanced RAG system.
Given the user's question and recent conversation history, generate 4 representations:

1. rewrite:
   - Make the question completely standalone.
   - Resolve all relative terms and pronouns (e.g. "it", "they", "that table", "the second option").
   - If the question is already standalone, keep it unchanged.

2. stepBack:
   - Formulate a higher-level, more general conceptual question.
   - Example: For "Why did the database deadlock on row 42?", stepBack would be "How does database concurrency control and row locking work?".

3. subQuestions:
   - If the user query contains multiple requests (e.g. "What is X, how does it differ from Y, and what are the pricing tiers?"), decompose it into up to 3 focused, atomic questions.
   - If the question is single-focus, return [].

4. hyde (Hypothetical Document Embeddings):
   - Hallucinate a realistic, authoritative excerpt (100-150 words) that would directly answer the question.
   - Do NOT say "I think" or "This document discusses". Write it in the tone of a textbook or technical spec.
   - (Note: This is strictly an embedding search vector, never shown to the user).`,
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
