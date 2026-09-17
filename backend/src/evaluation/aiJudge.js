import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Faithfulness / Hallucination Judge
// ─────────────────────────────────────────────────────────────────────────────
export const FaithfulnessSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Faithfulness score from 0.0 (total hallucination) to 1.0 (completely grounded in context)"),
  hasHallucination: z
    .boolean()
    .describe("True if the answer makes any factual claim not supported by the context"),
  supportedClaims: z
    .array(z.string())
    .describe("Claims in the answer directly backed by the context"),
  unsupportedClaims: z
    .array(z.string())
    .describe("Claims in the answer not supported or contradicted by the context"),
  reasoning: z
    .string()
    .describe("1-2 sentence concise justification for the score"),
});

const faithfulnessJudgeAgent = new Agent({
  name: "faithfulness-evaluator",
  model: "gpt-4.1-mini",
  outputType: FaithfulnessSchema,
  instructions: `You are an expert AI evaluation judge specializing in RAG faithfulness and grounding verification.
Your task is to determine whether every single factual claim made in the ASSISTANT ANSWER is strictly derived from and supported by the RETRIEVED CONTEXT.

Rules:
1. Grounding Standard:
   - If a claim cannot be verified from the context alone, it is UNSUPPORTED (even if true in the real world).
   - Polite conversational phrases ("Sure, here is the answer", "Based on your documents") are not factual claims; ignore them.
2. Scoring:
   - Score = (Supported Claims) / (Total Factual Claims).
   - If there are zero claims made (e.g. refusal or direct conversational pleasantry), score is 1.0 and hasHallucination is false.
   - If unsupported claims > 0, hasHallucination MUST be true.`,
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Answer Relevance Judge
// ─────────────────────────────────────────────────────────────────────────────
export const AnswerRelevanceSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Relevance score from 0.0 (completely off-topic/evasive) to 1.0 (directly answers query)"),
  isRelevant: z
    .boolean()
    .describe("Whether the answer adequately addresses the user prompt"),
  addressedAspects: z
    .array(z.string())
    .describe("Aspects of the user query that were answered"),
  missingAspects: z
    .array(z.string())
    .describe("Aspects of the user query that were omitted or ignored"),
  reasoning: z
    .string()
    .describe("1-2 sentence explanation of the relevance rating"),
});

const answerRelevanceJudgeAgent = new Agent({
  name: "answer-relevance-evaluator",
  model: "gpt-4.1-mini",
  outputType: AnswerRelevanceSchema,
  instructions: `You are an expert AI evaluation judge assessing whether the ASSISTANT ANSWER directly answers the USER QUESTION.

Rules:
1. Relevance:
   - An answer is relevant if it directly addresses the specific question asked.
   - Penalize answers that dodge the question, include irrelevant tangents, or repeat boilerplate.
   - If the system politely refused because context was missing, and that was the appropriate action, score as relevant (0.8 - 1.0).
2. Scoring:
   - 1.0: Directly and comprehensively answers the question.
   - 0.5 - 0.7: Partially answers, but leaves key parts unresolved.
   - 0.0 - 0.4: Irrelevant, evasive, or answers a completely different question.`,
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Context Precision Judge
// ─────────────────────────────────────────────────────────────────────────────
export const ContextPrecisionSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Context precision score from 0.0 (pure noise) to 1.0 (high signal-to-noise ratio)"),
  relevantPassagesCount: z
    .number()
    .describe("Number of passages containing information useful for the question"),
  totalPassagesCount: z
    .number()
    .describe("Total number of passages provided"),
  reasoning: z
    .string()
    .describe("1-2 sentence explanation of the retrieval signal quality"),
});

const contextPrecisionJudgeAgent = new Agent({
  name: "context-precision-evaluator",
  model: "gpt-4.1-mini",
  outputType: ContextPrecisionSchema,
  instructions: `You are an expert evaluation judge assessing the quality of RETRIEVED DOCUMENT PASSAGES for a given USER QUESTION.

Determine what proportion of the provided passages are genuinely relevant and necessary to answer the question.
Score = (Relevant Passages) / (Total Passages).`,
});

// ─────────────────────────────────────────────────────────────────────────────
// Public Evaluation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates whether an assistant answer is grounded in the retrieved context.
 */
export async function evaluateFaithfulness(question, context, answer) {
  if (!answer || !answer.trim()) {
    return {
      score: 1.0,
      hasHallucination: false,
      supportedClaims: [],
      unsupportedClaims: [],
      reasoning: "Empty answer.",
    };
  }

  const prompt = `
USER QUESTION:
${question}

RETRIEVED CONTEXT:
${context || "No context provided."}

ASSISTANT ANSWER:
${answer}
  `.trim();

  const res = await run(faithfulnessJudgeAgent, prompt);
  return res.finalOutput;
}

/**
 * Evaluates whether an assistant answer is relevant to the user question.
 */
export async function evaluateAnswerRelevance(question, answer) {
  if (!question || !answer) {
    return {
      score: 0.0,
      isRelevant: false,
      addressedAspects: [],
      missingAspects: ["Missing question or answer"],
      reasoning: "Missing question or answer.",
    };
  }

  const prompt = `
USER QUESTION:
${question}

ASSISTANT ANSWER:
${answer}
  `.trim();

  const res = await run(answerRelevanceJudgeAgent, prompt);
  return res.finalOutput;
}

/**
 * Evaluates whether the retrieved passages are high-signal for the query.
 */
export async function evaluateContextPrecision(question, passages = []) {
  if (!passages || passages.length === 0) {
    return {
      score: 0.0,
      relevantPassagesCount: 0,
      totalPassagesCount: 0,
      reasoning: "No passages retrieved.",
    };
  }

  const formattedPassages = passages
    .map((p, idx) => `[Passage ${idx + 1}]:\n${p.content || p.pageContent || p}`)
    .join("\n\n---\n\n");

  const prompt = `
USER QUESTION:
${question}

RETRIEVED PASSAGES (${passages.length} total):
${formattedPassages}
  `.trim();

  const res = await run(contextPrecisionJudgeAgent, prompt);
  return res.finalOutput;
}

/**
 * Evaluates a complete trace turn across all 3 RAG Triad dimensions concurrently.
 */
export async function evaluateRAGTriad(question, context, answer, passages = []) {
  const [faithfulness, answerRelevance, contextPrecision] = await Promise.all([
    evaluateFaithfulness(question, context, answer),
    evaluateAnswerRelevance(question, answer),
    evaluateContextPrecision(question, passages),
  ]);

  return {
    faithfulness,
    answerRelevance,
    contextPrecision,
    evaluatedAt: new Date(),
  };
}
