import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";

// 1. Zod schema for structured context grading and corrective diagnostics
export const ContextGradeSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "Holistic context quality score: 0 = completely irrelevant/noise, 10 = fully sufficient to answer the user's question accurately without hallucinating"
    ),
  isSufficient: z
    .boolean()
    .describe(
      "true if score >= 6 and the retrieved passages contain sufficient facts to address the core question"
    ),
  reasoning: z
    .string()
    .describe("Brief 1-2 sentence explanation of coverage and what is missing"),
  missingInfo: z
    .string()
    .describe(
      "Specific missing facts, entities, dates, or topics needed to answer the question, or 'None' if fully covered"
    ),
  suggestedKeywords: z
    .array(z.string())
    .describe(
      "1-3 targeted search phrases or keywords to retrieve the missing information in a corrective retry"
    ),
});

// 2. Define the Context Grader Agent
const contextGraderAgent = new Agent({
  name: "context-grader",
  model: "gpt-4.1-mini",
  outputType: ContextGradeSchema,
  instructions: `You are a strict retrieval completeness evaluator and diagnostic grader for an AI research system (CRAG - Corrective RAG).
Your job is to evaluate the ENTIRE retrieved context package against the user's question:

1. Evaluate Sufficiency:
   - 8-10 (Sufficient): The passages directly and reliably contain all key facts needed to answer the question completely.
   - 6-7 (Mostly Sufficient): The core answer is present, though minor peripheral details may be absent.
   - 4-5 (Partially Insufficient): Some relevant topics are mentioned, but vital facts or numbers needed to answer the core question are missing.
   - 0-3 (Irrelevant / Empty): The passages talk about completely different topics or contain no useful facts.

2. Diagnostic Feedback:
   - If score < 6 (or critical facts are absent), set isSufficient = false.
   - Explicitly detail in 'missingInfo' what specific piece of information or question sub-aspect is not in the passages.
   - Provide 1-3 crisp, search-friendly query phrases in 'suggestedKeywords' that can be dispatched to find the missing facts.
   - If the context is sufficient, set isSufficient = true, missingInfo = "None", and suggestedKeywords = [].`,
});

/**
 * Evaluates whether the assembled retrieved passages collectively satisfy the user's question.
 * Used as the gatekeeper for Corrective RAG (CRAG) before final generation.
 *
 * @param {string} question - The original user question.
 * @param {Array<object>} retrievedChunks - The top reranked and diversified chunks.
 * @param {Array<object>} conversationHistory - Prior conversation messages [{ role, content }].
 * @returns {Promise<{ score: number, isSufficient: boolean, reasoning: string, missingInfo: string, suggestedKeywords: string[] }>}
 */
export async function gradeContext(
  question,
  retrievedChunks = [],
  conversationHistory = []
) {
  // If no chunks were retrieved, fail fast with actionable retry keywords
  if (!Array.isArray(retrievedChunks) || retrievedChunks.length === 0) {
    return {
      score: 0,
      isSufficient: false,
      reasoning: "No candidate passages were retrieved.",
      missingInfo: "All context is missing.",
      suggestedKeywords: [question],
    };
  }

  // 1. Format the assembled context passages
  const contextSnippet = retrievedChunks
    .map((chunk, idx) => {
      const source = chunk.metadata?.originalFileName || "Source";
      const page = chunk.metadata?.pageNumber ? ` (Page ${chunk.metadata.pageNumber})` : "";
      return `[Passage ${idx + 1}] ${source}${page}:\n${chunk.pageContent}`;
    })
    .join("\n\n---\n\n");

  // 2. Format recent conversation turns if available
  let historyContext = "";
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-3);
    historyContext = recent
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");
  }

  const prompt = historyContext
    ? `Recent Conversation Context:\n${historyContext}\n\nUser Question: ${question}\n\nRetrieved Passages to Grade:\n${contextSnippet}`
    : `User Question: ${question}\n\nRetrieved Passages to Grade:\n${contextSnippet}`;

  try {
    const result = await run(contextGraderAgent, prompt);
    const grade = result.finalOutput;

    return {
      score: grade.score,
      isSufficient: grade.isSufficient ?? grade.score >= 6,
      reasoning: grade.reasoning,
      missingInfo: grade.missingInfo || "None",
      suggestedKeywords: Array.isArray(grade.suggestedKeywords)
        ? grade.suggestedKeywords
        : [],
    };
  } catch (error) {
    console.error("❌ Context grading failed, proceeding with fallback:", error);
    // Graceful fallback: Do not block generation on grader network/API hiccups
    return {
      score: 7,
      isSufficient: true,
      reasoning: "Grader fallback due to error; assuming context is usable.",
      missingInfo: "None",
      suggestedKeywords: [],
    };
  }
}
