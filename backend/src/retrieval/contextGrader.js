import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import { typeSafeClient } from "../../shared/libs/typesafe.js";
import { score, noul } from "@typesafe-ai/sdk";

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

// 2. Define the Context Grader Agent (Fallback)
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
 * Uses TypeSafe System One (Jev) for sub-100ms calibrated completeness scoring,
 * with automatic fallback to Agent SDK.
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

  // 3. Try TypeSafe System One (Jev) for sub-100ms calibrated grading
  if (typeSafeClient) {
    try {
      const response = await typeSafeClient.systemOne({
        state: {
          user_question: question,
          conversation_history: historyContext || "None",
          retrieved_passages: contextSnippet,
        },
        questions: {
          completeness: score(
            "Rate the completeness and factual sufficiency of the retrieved passages for answering the user's question completely without hallucinating.",
            [
              "0: Completely off-topic or contains zero useful facts",
              "1: Mentions related topics but vital facts or numbers needed to answer the core question are absent",
              "2: Core answer is present in the passages, though minor peripheral details may be absent",
              "3: Directly and authoritatively contains all key facts needed to answer the question completely",
            ]
          ),
          is_sufficient: noul(
            "Do the retrieved passages collectively contain sufficient facts to address the core user question?"
          ),
        },
      });

      const rawScore = response.answers.completeness?.score ?? 2;
      const scaledScore = Math.round((rawScore / 3) * 10 * 10) / 10;
      const noulProb = response.answers.is_sufficient?.noul ?? 0.5;
      const isSufficient = noulProb >= 0.5 || scaledScore >= 6.0;

      return {
        score: scaledScore,
        isSufficient,
        reasoning: `TypeSafe Jev System One (Completeness: ${rawScore}/3, Sufficiency prob: ${noulProb.toFixed(2)})`,
        missingInfo: isSufficient ? "None" : "Missing factual details to answer query",
        suggestedKeywords: isSufficient ? [] : [question],
      };
    } catch (err) {
      console.warn("⚠️ TypeSafe context grading failed, falling back to agent SDK:", err.message);
    }
  }

  // 4. Fallback to Agent SDK runner
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
    console.error("❌ Context grading failed, using conservative fallback:", error);
    return {
      score: 4,
      isSufficient: false,
      reasoning: "Grader unavailable; assuming moderate quality to allow corrective retrieval.",
      missingInfo: "Unable to assess — grader error",
      suggestedKeywords: [question],
    };
  }
}

