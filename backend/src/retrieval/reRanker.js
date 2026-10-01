import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import { typeSafeClient } from "../../shared/libs/typesafe.js";
import { score } from "@typesafe-ai/sdk";

// 1. Zod schema for structured LLM relevance scoring
export const RerankScoresSchema = z.object({
  scores: z
    .array(
      z.object({
        index: z.number().describe("Zero-based index of the passage"),
        relevance: z
          .number()
          .min(0)
          .max(10)
          .describe(
            "Relevance score 0-10: 0 = completely irrelevant/noise, 10 = directly and completely answers the question"
          ),
      })
    )
    .describe("Scores for each candidate passage"),
});

// 2. Define the LLM Relevance Scorer Agent
const relevanceScorerAgent = new Agent({
  name: "relevance-scorer",
  model: "gpt-4.1-mini",
  outputType: RerankScoresSchema,
  instructions: `You are a strict retrieval precision grader.
Evaluate candidate document passages against the user's question, taking into account the recent conversation context if the question contains pronouns or refers to prior turns (e.g. "Why did that happen?", "Tell me more about it").

For each numbered passage [index], assign a relevance score from 0 to 10:
- 9-10: Directly and authoritatively contains the answer to the question.
- 6-8: Strongly relevant, provides key facts or crucial context for the answer.
- 3-5: Mentions related topics but does not directly address the question.
- 0-2: Off-topic, tangential, boilerplate, or completely irrelevant.

Be strict — only give high scores to passages that actually answer the question.`,
});

/**
 * Computes Jaccard token similarity between two text passages.
 * Used by MMR to detect and penalize near-duplicate or overlapping chunks.
 */
function computeTextSimilarity(textA, textB) {
  const tokenize = (t) =>
    new Set((t || "").toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/));
  const setA = tokenize(textA);
  const setB = tokenize(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Maximal Marginal Relevance (MMR) Diversity Filter.
 * Balances query relevance against redundancy among already-selected chunks.
 * Prevents returning 4 near-identical chunks from the same paragraph.
 *
 * MMR = argmax [ λ * relevance - (1 - λ) * max(similarity_to_already_selected) ]
 *
 * @param {Array<{ chunk: object, score: number }>} scoredCandidates
 * @param {number} topN - Target number of chunks to select
 * @param {number} lambda - Balance factor: 0.7 = 70% relevance weight, 30% diversity weight
 * @returns {Array<object>} Diverse, highly-relevant chunks
 */
function mmrDiversityFilter(scoredCandidates, topN = 8, lambda = 0.7) {
  if (scoredCandidates.length <= topN) {
    return scoredCandidates.map((item) => ({
      ...item.chunk,
      rerankScore: item.score,
    }));
  }

  const selected = [];
  const remaining = [...scoredCandidates];

  while (selected.length < topN && remaining.length > 0) {
    let bestIndex = 0;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      // Normalize relevance score from [0, 10] to [0, 1]
      const normalizedRelevance = candidate.score / 10;

      // Max similarity against already chosen chunks
      let maxSimToSelected = 0;
      for (const sel of selected) {
        const sim = computeTextSimilarity(
          candidate.chunk.pageContent,
          sel.chunk.pageContent
        );
        if (sim > maxSimToSelected) maxSimToSelected = sim;
      }

      // Compute MMR score
      const mmrScore =
        lambda * normalizedRelevance - (1 - lambda) * maxSimToSelected;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIndex = i;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected.map((item) => ({
    ...item.chunk,
    rerankScore: item.score,
  }));
}

/**
 * Reranks candidate chunks using an LLM precision pass + MMR diversity filter.
 * Accepts conversation context so follow-up queries (e.g. "Why?", "What about the second phase?")
 * can be evaluated with full awareness of prior discussion.
 *
 * @param {string} originalQuestion - The raw user question
 * @param {Array<object>} candidateChunks - Filtered chunks from relevanceFloor
 * @param {object|Array} optionsOrHistory - { topN, lambda, conversationHistory } OR conversationHistory array
 * @param {object} maybeOptions - Optional options if conversationHistory was passed as 3rd arg
 * @returns {Promise<Array<object>>} Top N reranked and diversified chunks
 */
export async function rerank(
  originalQuestion,
  candidateChunks,
  optionsOrHistory = {},
  maybeOptions = {}
) {
  if (!Array.isArray(candidateChunks) || candidateChunks.length === 0) {
    return [];
  }

  // Handle both signatures: rerank(q, chunks, { conversationHistory, topN }) OR rerank(q, chunks, history, { topN })
  let conversationHistory = [];
  let topN = 8;
  let lambda = 0.7;

  if (Array.isArray(optionsOrHistory)) {
    conversationHistory = optionsOrHistory;
    topN = maybeOptions.topN ?? 8;
    lambda = maybeOptions.lambda ?? 0.7;
  } else {
    conversationHistory = optionsOrHistory.conversationHistory || [];
    topN = optionsOrHistory.topN ?? 8;
    lambda = optionsOrHistory.lambda ?? 0.7;
  }

  // If candidate count is already <= 1, return directly
  if (candidateChunks.length <= 1) {
    return candidateChunks;
  }

  // 1. Format candidate passages with numeric index for the LLM
  const numberedPassages = candidateChunks
    .map((chunk, idx) => {
      const source = chunk.metadata?.originalFileName || "Document";
      const page = chunk.metadata?.pageNumber ? `, Page ${chunk.metadata.pageNumber}` : "";
      return `[${idx}] Source: ${source}${page}\n${chunk.pageContent}`;
    })
    .join("\n\n---\n\n");

  // 2. Format recent conversation turns (last 3 turns) to resolve pronouns
  let historyContext = "";
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-3);
    historyContext = recent
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");
  }

  const prompt = historyContext
    ? `Recent Conversation Context:\n${historyContext}\n\nUser Question: ${originalQuestion}\n\nCandidate Passages to Grade:\n${numberedPassages}`
    : `User Question: ${originalQuestion}\n\nCandidate Passages to Grade:\n${numberedPassages}`;

  // 3. Try TypeSafe System One (Jev) first for sub-second calibrated scoring
  if (typeSafeClient) {
    try {
      const scoreMap = new Map();
      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < candidateChunks.length; i += BATCH_SIZE) {
        batches.push(
          candidateChunks.slice(i, i + BATCH_SIZE).map((chunk, relIdx) => ({
            chunk,
            originalIndex: i + relIdx,
          }))
        );
      }

      await Promise.all(
        batches.map(async (batch) => {
          const state = {
            user_question: originalQuestion,
            conversation_history: historyContext || "None",
          };
          const questions = {};

          batch.forEach((item, bIdx) => {
            const chunk = item.chunk;
            const source = chunk.metadata?.originalFileName || "Document";
            const page = chunk.metadata?.pageNumber ? `, Page ${chunk.metadata.pageNumber}` : "";
            state[`passage_${bIdx}`] = `Source: ${source}${page}\n${chunk.pageContent}`;

            questions[`score_${bIdx}`] = score(
              `How directly and authoritatively does passage_${bIdx} contain facts that answer the user question?`,
              [
                "0: Off-topic, tangential, boilerplate, or completely irrelevant to the question.",
                "1: Mentions related topics or domain concepts but does not directly address the question.",
                "2: Strongly relevant, provides key facts or crucial context for the answer.",
                "3: Directly and authoritatively contains the answer to the question.",
              ]
            );
          });

          const res = await typeSafeClient.systemOne({ state, questions });
          batch.forEach((item, bIdx) => {
            const ans = res.answers?.[`score_${bIdx}`];
            const rawScore = typeof ans?.score === "number" ? ans.score : 1.0;
            // Scale 0-3 to 0-10
            const scaledScore = Math.round((rawScore / 3) * 10 * 10) / 10;
            scoreMap.set(item.originalIndex, scaledScore);
          });
        })
      );

      // Associate scores with candidate chunks
      const scoredCandidates = candidateChunks.map((chunk, idx) => ({
        chunk,
        score: scoreMap.has(idx) ? scoreMap.get(idx) : 3,
      }));

      // Sort by relevance score descending
      scoredCandidates.sort((a, b) => b.score - a.score);

      // Apply MMR diversity filter to eliminate repetitive text
      return mmrDiversityFilter(scoredCandidates, topN, lambda);
    } catch (err) {
      console.warn("⚠️ TypeSafe reranking failed, falling back to agent SDK:", err.message);
    }
  }

  // 4. Fallback to Agent SDK runner
  try {
    const result = await run(relevanceScorerAgent, prompt);
    const scoreMap = new Map();

    for (const item of result.finalOutput.scores || []) {
      scoreMap.set(item.index, item.relevance);
    }

    // Associate scores with candidate chunks
    const scoredCandidates = candidateChunks.map((chunk, idx) => ({
      chunk,
      score: scoreMap.has(idx) ? scoreMap.get(idx) : 3, // default neutral score if missing
    }));

    // Sort by relevance score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Apply MMR diversity filter to eliminate repetitive text
    const finalChunks = mmrDiversityFilter(scoredCandidates, topN, lambda);

    return finalChunks;
  } catch (error) {
    console.error("❌ Reranking failed, falling back to top candidates:", error);
    // Graceful fallback: return top candidates as-is without crashing
    return candidateChunks.slice(0, topN);
  }
}
