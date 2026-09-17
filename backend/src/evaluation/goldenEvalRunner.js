import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import GoldenDataset from "../../shared/models/goldenDataset.model.js";
import EvaluationRun from "../../shared/models/evaluationRun.model.js";
import { retrievalPipeline } from "../retrieval/pipeline.js";
import { evaluateFaithfulness, evaluateAnswerRelevance } from "./aiJudge.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Semantic Answer Correctness Evaluator (Generated vs Ground Truth Answer)
// ─────────────────────────────────────────────────────────────────────────────
export const AnswerCorrectnessSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Correctness score from 0.0 (wrong/contradictory) to 1.0 (semantically identical)"),
  isFactuallyAccurate: z
    .boolean()
    .describe("Whether the generated answer conveys the core truth of the golden answer"),
  matchingFacts: z
    .array(z.string())
    .describe("Facts present in both generated and golden answer"),
  missingOrContradictedFacts: z
    .array(z.string())
    .describe("Key golden facts missed or contradicted by the generated answer"),
  reasoning: z
    .string()
    .describe("Brief 1-2 sentence justification"),
});

const answerCorrectnessAgent = new Agent({
  name: "answer-correctness-judge",
  model: "gpt-4.1-mini",
  outputType: AnswerCorrectnessSchema,
  instructions: `You are an expert AI evaluation judge assessing the FACTUAL CORRECTNESS of an AI-generated answer against a verified GROUND TRUTH GOLDEN ANSWER.

Compare the GENERATED ANSWER to the GOLDEN ANSWER:
- Score 1.0: Conveys all the key facts from the golden answer with no contradictions.
- Score 0.6 - 0.8: Mostly correct, but misses minor details or nuances.
- Score 0.3 - 0.5: Partially correct, but misses major facts.
- Score 0.0 - 0.2: Factually incorrect, contradictory, or refuses to answer when a golden answer exists.`,
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Context Recall Evaluator (Retrieved Context vs Ground Truth Context)
// ─────────────────────────────────────────────────────────────────────────────
export const ContextRecallSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Context recall score from 0.0 (missed entirely) to 1.0 (fully retrieved)"),
  recalledSentencesCount: z.number().describe("Number of key golden facts found in retrieved context"),
  totalGoldenSentencesCount: z.number().describe("Total number of key golden facts needed"),
  reasoning: z.string().describe("1-2 sentence explanation of context recall"),
});

const contextRecallAgent = new Agent({
  name: "context-recall-judge",
  model: "gpt-4.1-mini",
  outputType: ContextRecallSchema,
  instructions: `You are an expert AI evaluation judge assessing CONTEXT RECALL for a RAG retrieval engine.
Your job is to determine whether the RETRIEVED CONTEXT successfully recalled the necessary facts present in the GROUND TRUTH CONTEXT.

Score = (Recalled Golden Facts found in Retrieved Context) / (Total Golden Facts).
If the retrieved context contains all the necessary information, score is 1.0.`,
});

// Generation agent to produce response for golden questions during eval
const evalGenerationAgent = new Agent({
  name: "eval-rag-generator",
  model: "gpt-4.1-mini",
  instructions: `You are an AI research assistant. Answer the user question accurately, thoroughly, and strictly using the provided document evidence.
If evidence is insufficient, state so clearly.`,
});

/**
 * Runs an end-to-end AI evaluation benchmark against a Golden Dataset.
 * Computes:
 * - Context Recall (vs Golden Context)
 * - Answer Correctness (vs Golden Answer)
 * - Faithfulness (vs Retrieved Context)
 * - Answer Relevance (vs Question)
 * - Retrieval Latency
 *
 * @param {string} goldenDatasetId - MongoDB ID of GoldenDataset
 * @param {string} userId - Authenticated user ID
 * @param {object} [options]
 * @returns {Promise<object>} Detailed benchmark results & overall score summary
 */
export async function runGoldenEvaluation(goldenDatasetId, userId, options = {}) {
  const dataset = await GoldenDataset.findById(goldenDatasetId);
  if (!dataset) {
    throw new Error(`Golden Dataset not found: ${goldenDatasetId}`);
  }

  const testCases = dataset.testCases || [];
  if (testCases.length === 0) {
    throw new Error(`Golden Dataset has 0 test cases: ${goldenDatasetId}`);
  }

  console.log(
    `🎯 Running AI evaluation against Golden Dataset "${dataset.name}" (${testCases.length} goldens)...`
  );

  const results = [];
  const sourceIds = dataset.sourceIds?.map((id) => id.toString()) || [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const { question, groundTruthAnswer, groundTruthContext } = testCase;

    console.log(`  [${i + 1}/${testCases.length}] Evaluating Golden: "${question}"`);

    // 1. Run the retrieval pipeline
    const tStart = Date.now();
    const retrievalResult = await retrievalPipeline(
      question,
      sourceIds.length > 0 ? sourceIds : (testCase.sourceId ? [testCase.sourceId.toString()] : []),
      userId,
      []
    );
    const retrievalLatencyMs = Date.now() - tStart;

    const retrievedDocs = retrievalResult.docs || [];
    const formattedContext = retrievedDocs
      .map((d, idx) => `[Source ${idx + 1}]:\n${d.content || d.pageContent || ""}`)
      .join("\n\n---\n\n");

    // 2. Generate answer with retrieved context
    const genPrompt = `RETRIEVED CONTEXT:\n${formattedContext || "No context found."}\n\nQUESTION:\n${question}`;
    const genResult = await run(evalGenerationAgent, genPrompt);
    const generatedAnswer = genResult.finalOutput || "";

    // 3. Concurrently run AI Judges
    const [recallJudge, correctnessJudge, faithfulnessJudge, relevanceJudge] = await Promise.all([
      // Context Recall
      run(
        contextRecallAgent,
        `GROUND TRUTH GOLDEN CONTEXT:\n${groundTruthContext}\n\nRETRIEVED CONTEXT:\n${formattedContext || "None."}`
      ).then((r) => r.finalOutput),

      // Answer Correctness
      run(
        answerCorrectnessAgent,
        `QUESTION:\n${question}\n\nGOLDEN ANSWER (Ground Truth):\n${groundTruthAnswer}\n\nGENERATED ANSWER:\n${generatedAnswer}`
      ).then((r) => r.finalOutput),

      // Faithfulness
      evaluateFaithfulness(question, formattedContext, generatedAnswer),

      // Answer Relevance
      evaluateAnswerRelevance(question, generatedAnswer),
    ]);

    results.push({
      testCaseId: testCase._id,
      question,
      groundTruthAnswer,
      generatedAnswer,
      metrics: {
        contextRecall: recallJudge.score,
        answerCorrectness: correctnessJudge.score,
        faithfulness: faithfulnessJudge.score,
        answerRelevance: relevanceJudge.score,
        retrievalLatencyMs,
        chunksRetrieved: retrievedDocs.length,
      },
      judgements: {
        contextRecallReasoning: recallJudge.reasoning,
        correctnessReasoning: correctnessJudge.reasoning,
        faithfulnessReasoning: faithfulnessJudge.reasoning,
        relevanceReasoning: relevanceJudge.reasoning,
      },
    });
  }

  // Calculate overall dataset aggregates
  const total = results.length;
  const summary = {
    totalTestCases: total,
    meanContextRecall: Number(
      (results.reduce((s, r) => s + r.metrics.contextRecall, 0) / total).toFixed(3)
    ),
    meanAnswerCorrectness: Number(
      (results.reduce((s, r) => s + r.metrics.answerCorrectness, 0) / total).toFixed(3)
    ),
    meanFaithfulness: Number(
      (results.reduce((s, r) => s + r.metrics.faithfulness, 0) / total).toFixed(3)
    ),
    meanAnswerRelevance: Number(
      (results.reduce((s, r) => s + r.metrics.answerRelevance, 0) / total).toFixed(3)
    ),
    meanLatencyMs: Math.round(
      results.reduce((s, r) => s + r.metrics.retrievalLatencyMs, 0) / total
    ),
  };

  console.log(`✅ Golden evaluation completed:`, summary);

  return {
    datasetId: dataset._id,
    datasetName: dataset.name,
    summary,
    results,
    evaluatedAt: new Date(),
  };
}
