import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";

// 1. Zod schema for structured channel routing decisions
export const ChannelRoutingSchema = z.object({
  channels: z
    .array(z.enum(["VECTOR", "BM25", "MONGO"]))
    .min(1)
    .describe(
      "Channels to query: 'VECTOR' for semantic search, 'BM25' for exact term/code matching, 'MONGO' for document count/metadata queries."
    ),
  reasoning: z
    .string()
    .describe("Brief 1-sentence rationale for the channel selection"),
  exactTerms: z
    .array(z.string())
    .describe(
      "Extracted verbatim keywords, error codes, function names, quoted phrases, or IDs targeted for BM25 matching."
    ),
});

// 2. Define the Channel Router Agent
const channelRouterAgent = new Agent({
  name: "channel-router",
  model: "gpt-4.1-mini",
  outputType: ChannelRoutingSchema,
  instructions: `You are a search channel router for an advanced enterprise hybrid RAG engine.
Analyze the given query and select which storage channels should be queried:

1. VECTOR (Dense Semantic Search via Qdrant):
   - Best for conceptual understanding, descriptions, explanations, and thematic queries.
   - Include in almost all informational questions.

2. BM25 (Sparse Keyword Search via MongoDB):
   - Mandatory whenever the query mentions:
     * Specific error codes (e.g. ERR_504, 0x80070005)
     * Exact function/class/file names (e.g. sourceProcessor.js, getUserById)
     * Technical acronyms, product SKUs, version numbers (e.g. v2.1.0)
     * Quoted phrases (e.g. "terms of service")
   - Populate 'exactTerms' with those specific tokens to boost BM25 precision.

3. MONGO (Structured Metadata & Document Aggregations):
   - Use when the query asks about document counts, upload dates, or listing sources:
     * "How many PDFs do I have?"
     * "List all my uploaded spreadsheets"
     * "When was my resume uploaded?"
   - Can run alongside or instead of vector search depending on whether text content is needed.`,
});

/**
 * Determines which retrieval channels (VECTOR, BM25, MONGO) should be queried.
 * @param {string} question - The user query or translated rewrite.
 * @returns {Promise<{ channels: Set<string>, exactTerms: string[], reasoning: string }>}
 */
export async function routeQuery(question) {
  if (!question || !question.trim()) {
    return {
      channels: new Set(["VECTOR"]),
      exactTerms: [],
      reasoning: "Default fallback for empty query",
    };
  }

  try {
    const prompt = `Query to route:\n${question}`;
    const result = await run(channelRouterAgent, prompt);
    const decision = result.finalOutput;

    return {
      // Returns a Set for O(1) checks (e.g. channels.has("BM25"))
      channels: new Set(decision.channels),
      exactTerms: decision.exactTerms || [],
      reasoning: decision.reasoning,
    };
  } catch (error) {
    console.error("Channel router error, falling back to hybrid:", error);
    // Graceful fallback: Hybrid search (Vector + BM25) ensures no missed results
    return {
      channels: new Set(["VECTOR", "BM25"]),
      exactTerms: [],
      reasoning: "Fallback hybrid routing",
    };
  }
}
