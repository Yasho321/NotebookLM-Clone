import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import Chunk from "../../shared/models/chunk.model.js";
import GoldenDataset from "../../shared/models/goldenDataset.model.js";

// Zod schema for synthetic golden test case generation
export const GoldenQAPairSchema = z.object({
  qaPairs: z
    .array(
      z.object({
        question: z
          .string()
          .describe("A natural, specific question a user would realistically ask that requires this passage to answer"),
        groundTruthAnswer: z
          .string()
          .describe("A complete, factually rigorous ground-truth answer derived strictly from the provided text"),
        groundTruthContext: z
          .string()
          .describe("The exact excerpt or key sentences from the text that prove the answer"),
      })
    )
    .min(1)
    .describe("List of high-quality Q&A evaluation pairs generated from the source section"),
});

const goldenGeneratorAgent = new Agent({
  name: "golden-dataset-generator",
  model: "gpt-4.1-mini",
  outputType: GoldenQAPairSchema,
  instructions: `You are an expert AI evaluation engineer creating a "Golden Evaluation Dataset" (ground-truth test cases) for benchmarking a multi-source RAG system.
Given a section of text from a user document:
1. Generate 1 to 3 challenging, high-value questions that can be definitively answered from this text.
2. For each question, formulate a clear, precise "groundTruthAnswer" containing the exact facts.
3. Extract the exact "groundTruthContext" snippet from the passage that justifies the answer.

Guidelines:
- Avoid trivial or yes/no questions. Formulate questions testing core concepts, metrics, dates, definitions, and procedures.
- Do NOT refer to "the text" or "according to the passage" in the question; write the question as a real user would ask it.
- The groundTruthAnswer must be self-contained, completely factual, and strictly grounded in the passage.`,
});

/**
 * Automatically generates a Golden Dataset from the uploaded sources of a user.
 * Samples parent chunks across the sources and synthesizes ground-truth Q&A pairs.
 *
 * @param {string[]} sourceIds - Array of source document IDs
 * @param {string} userId - User ID
 * @param {object} options
 * @param {number} [options.sampleCount=5] - Number of chunk sections to sample
 * @param {string} [options.name] - Dataset name
 * @returns {Promise<object>} Created GoldenDataset document
 */
export async function generateGoldenDataset(
  sourceIds = [],
  userId,
  { sampleCount = 5, name = null } = {}
) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    throw new Error("At least one sourceId is required to generate golden test cases");
  }

  // 1. Fetch representative parent chunks from these sources
  const candidateChunks = await Chunk.find({
    sourceId: { $in: sourceIds },
    userId: userId.toString(),
    level: "parent",
  })
    .select("_id sourceId pageContent metadata")
    .limit(sampleCount * 2)
    .lean();

  // If no parent chunks found, fall back to child chunks
  const chunksToUse = candidateChunks.length > 0
    ? candidateChunks
    : await Chunk.find({
        sourceId: { $in: sourceIds },
        userId: userId.toString(),
      })
        .select("_id sourceId pageContent metadata")
        .limit(sampleCount * 2)
        .lean();

  if (chunksToUse.length === 0) {
    throw new Error("No text chunks found for the selected sources to generate goldens");
  }

  // Sample evenly from available chunks
  const step = Math.max(1, Math.floor(chunksToUse.length / sampleCount));
  const sampledChunks = [];
  for (let i = 0; i < chunksToUse.length && sampledChunks.length < sampleCount; i += step) {
    sampledChunks.push(chunksToUse[i]);
  }

  console.log(
    `🧪 Synthesizing golden evaluation dataset from ${sampledChunks.length} document sections...`
  );

  const generatedTestCases = [];

  for (const chunk of sampledChunks) {
    const fileName = chunk.metadata?.originalFileName || "Document";
    const page = chunk.metadata?.pageNumber || 1;
    const prompt = `DOCUMENT: ${fileName} (Page ${page})\n\nSECTION CONTENT:\n${chunk.pageContent}`;

    try {
      const result = await run(goldenGeneratorAgent, prompt);
      const { qaPairs } = result.finalOutput;

      for (const pair of qaPairs) {
        generatedTestCases.push({
          question: pair.question,
          groundTruthAnswer: pair.groundTruthAnswer,
          groundTruthContext: pair.groundTruthContext || chunk.pageContent.slice(0, 300),
          sourceId: chunk.sourceId,
          chunkId: chunk._id,
        });
      }
    } catch (err) {
      console.warn(`⚠️ Failed to generate golden QA for chunk ${chunk._id}:`, err.message);
    }
  }

  if (generatedTestCases.length === 0) {
    throw new Error("Failed to synthesize any golden test cases from the provided sources");
  }

  const datasetName = name || `Golden Test Set (${generatedTestCases.length} QA pairs)`;

  const goldenDataset = await GoldenDataset.create({
    userId,
    name: datasetName,
    description: `Auto-synthesized ground-truth evaluation dataset from ${sourceIds.length} source(s)`,
    sourceIds,
    testCases: generatedTestCases,
  });

  console.log(`✅ Generated Golden Dataset "${datasetName}" with ${generatedTestCases.length} test cases.`);

  return goldenDataset;
}
