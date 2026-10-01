import { routeAdaptiveStrategy } from "./adaptiveRouter.js";
import { translateQuery } from "./queryTranslator.js";
import { routeQuery } from "./queryRouter.js";
import { parallelSearch } from "./parallelSearcher.js";
import { weightedRRF } from "./rrfFusion.js";
import { applyRelevanceFloor } from "./relevanceFloor.js";
import { rerank } from "./reRanker.js";
import { correctiveRetrieval } from "./correctiveLoop.js";
import Chunk from "../../shared/models/chunk.model.js";

/**
 * Expands retrieved child chunks to their corresponding parent chunk context.
 * In parent-child chunking:
 * - Child chunks (~200 tokens) provide high-precision vector embeddings for retrieval.
 * - Parent chunks (~900 tokens) provide rich surrounding context to prevent answer fragmentation.
 *
 * @param {Array<object>} childDocs - Scored child chunk objects
 * @param {string} userId - User ID for security isolation
 * @param {boolean} preferParent - Whether to use parent chunk content as the primary content
 * @returns {Promise<Array<object>>} Documents enriched with parent context
 */
async function expandParentChunks(childDocs = [], userId, preferParent = false) {
  if (!Array.isArray(childDocs) || childDocs.length === 0) {
    return [];
  }

  // Extract unique parentChunkIds
  const parentIds = [
    ...new Set(
      childDocs
        .map((doc) => doc.parentChunkId)
        .filter((id) => id && id.toString().trim() !== "")
    ),
  ];

  if (parentIds.length === 0) {
    return childDocs.map((doc) => ({
      ...doc,
      content: doc.pageContent,
      parentContent: null,
    }));
  }

  try {
    const parentChunks = await Chunk.find({
      _id: { $in: parentIds },
      userId,
      level: "parent",
    })
      .lean()
      .exec();

    const parentMap = new Map(
      parentChunks.map((p) => [p._id.toString(), p.pageContent])
    );

    return childDocs.map((doc) => {
      const parentIdStr = doc.parentChunkId?.toString();
      const parentContent = parentIdStr && parentMap.has(parentIdStr)
        ? parentMap.get(parentIdStr)
        : null;

      return {
        ...doc,
        parentContent,
        // When preferParent is true (e.g. BROAD_SUMMARY), use parent content as primary
        content: (preferParent && parentContent) || doc.pageContent,
      };
    });
  } catch (err) {
    console.warn("⚠️ Parent chunk expansion failed, falling back to child content:", err);
    return childDocs.map((doc) => ({
      ...doc,
      content: doc.pageContent,
      parentContent: null,
    }));
  }
}

/**
 * Master Retrieval Pipeline orchestrating the full PragatiLM / Advanced RAG flow:
 *
 * 0. Adaptive Strategy Routing   → Classifies query (DIRECT_ANSWER, BROAD_SUMMARY, COMPLEX_DECOMPOSE, FACTUAL_SPECIFIC)
 * 1. Query Translation           → Generates rewrite, step-back, sub-questions, and HyDE variants
 * 2. Search Channel Routing      → Identifies active channels (VECTOR, BM25, MONGO) and exact search terms
 * 3. Parallel Search Fan-Out     → Executes dense vector + sparse BM25 across query variants concurrently
 * 4. Weighted RRF Fusion         → Fuses ranked lists with heavy preference for semantic vector results
 * 5. Dynamic Relevance Floor     → Prunes weak tail (< 25% of top candidate score) to protect context quality
 * 6. LLM Reranking + MMR         → Cross-encoder precision grading + text diversity filter
 * 7. Context Grading & CRAG Loop → Verifies context sufficiency; triggers targeted search for missing facts if needed
 * 8. Parent Context Expansion    → Re-attaches 900-token parent paragraphs to provide rich generation context
 *
 * @param {string} question - The user's query
 * @param {string[]|string} sourceIds - Active source document ID(s)
 * @param {string} userId - User ID for multi-tenant isolation
 * @param {Array<object>} [conversationHistory=[]] - Recent conversation turns [{ role, content }]
 * @param {object} [options={}] - Optional tuning overrides
 * @returns {Promise<{
 *   strategy: string,
 *   shouldRetrieve: boolean,
 *   shouldRefuse: boolean,
 *   docs: Array<object>,
 *   chunks: Array<object>,
 *   grade: object,
 *   metadata: object
 * }>}
 */
export async function retrievalPipeline(
  question,
  sourceIds,
  userId,
  conversationHistory = [],
  options = {}
) {
  const normalizedQuestion = (question || "").trim();

  // Normalize sourceIds to an array
  const activeSourceIds = Array.isArray(sourceIds)
    ? sourceIds
    : sourceIds
    ? [sourceIds]
    : [];

  // Start total pipeline timing
  const pipelineStartTime = Date.now();
  const timings = {};

  // =========================================================================
  // STEP 0, 1 & 2: Strategy Routing, Translation & Channel Routing (in PARALLEL)
  // All 3 LLM calls execute concurrently. routeQuery (~400ms) runs in the
  // background of translateQuery (~4,000ms), eliminating 400-600ms of serial latency.
  // =========================================================================
  const t01 = Date.now();
  const [strategyConfig, queryVariants, channelDecision] = await Promise.all([
    routeAdaptiveStrategy(normalizedQuestion, conversationHistory),
    translateQuery(normalizedQuestion, conversationHistory),
    routeQuery(normalizedQuestion),
  ]);
  timings.translationMs = Date.now() - t01;

  // Fast Path: Direct Answer (e.g., greetings, general pleasantries, pure non-doc chat)
  if (!strategyConfig.shouldRetrieve || strategyConfig.strategy === "DIRECT_ANSWER") {
    return {
      strategy: strategyConfig.strategy,
      shouldRetrieve: false,
      shouldRefuse: false,
      docs: [],
      chunks: [],
      grade: {
        score: 10,
        isSufficient: true,
        reasoning: "Direct answer route: No document retrieval needed.",
        missingInfo: "None",
        suggestedKeywords: [],
      },
      metadata: {
        strategy: strategyConfig.strategy,
        strategyReasoning: strategyConfig.reasoning,
        attempts: 0,
        queryVariants: [normalizedQuestion],
      },
    };
  }

  // If user has no sources selected, return early with clear explanation
  if (activeSourceIds.length === 0) {
    return {
      strategy: strategyConfig.strategy,
      shouldRetrieve: true,
      shouldRefuse: true,
      docs: [],
      chunks: [],
      grade: {
        score: 0,
        isSufficient: false,
        reasoning: "No source documents were selected to search from.",
        missingInfo: "Source documents missing.",
        suggestedKeywords: [],
      },
      metadata: {
        strategy: strategyConfig.strategy,
        strategyReasoning: strategyConfig.reasoning,
        attempts: 0,
        queryVariants: [normalizedQuestion],
      },
    };
  }

  // If strategy dictates not using HyDE or ablation skips it, omit hydeQuery
  if (!strategyConfig.useHyde || options.skipHyde) {
    queryVariants.hyde = null;
  }

  const activeChannels = new Set(channelDecision.channels);
  if (options.skipBM25) {
    activeChannels.delete("BM25");
  }

  // =========================================================================
  // STEP 3: Parallel Search Fan-Out (Vector + BM25)
  // =========================================================================
  const t3 = Date.now();
  const channelRankings = await parallelSearch(
    queryVariants,
    activeChannels,
    activeSourceIds,
    userId,
    {
      k: strategyConfig.kCandidate || 30,
      exactTerms: channelDecision.exactTerms || [],
    }
  );
  timings.searchMs = Date.now() - t3;

  // =========================================================================
  // STEP 4: Weighted Reciprocal Rank Fusion (RRF)
  // =========================================================================
  const t4 = Date.now();
  const fusedCandidates = weightedRRF(channelRankings, {
    topCandidates: strategyConfig.kCandidate || 30,
    kRRF: 60,
  });
  timings.fusionMs = Date.now() - t4;

  // =========================================================================
  // STEP 5: Dynamic Relevance Floor (Tail Pruning)
  // =========================================================================
  const t5 = Date.now();
  const flooredCandidates = options.skipFloor
    ? fusedCandidates
    : applyRelevanceFloor(fusedCandidates, {
        ratio: 0.25,
        minKeep: 3,
      });
  timings.floorMs = Date.now() - t5;

  // =========================================================================
  // STEP 6: LLM Reranking + MMR Diversity Filter
  // =========================================================================
  const t6 = Date.now();
  const rerankedChunks = options.skipRerank
    ? flooredCandidates.slice(0, strategyConfig.topN || 8)
    : await rerank(
        normalizedQuestion,
        flooredCandidates,
        {
          conversationHistory,
          topN: strategyConfig.topN || 8,
          lambda: 0.7,
        }
      );
  timings.rerankMs = Date.now() - t6;

  // =========================================================================
  // STEP 7 & 8: Context Grading & Corrective RAG (CRAG) Loop
  // =========================================================================
  const t7 = Date.now();

  // Fast-path: If top reranked chunks already have high confidence, skip the heavy CRAG loop.
  // This saves ~40-55 seconds on queries where retrieval is already spot-on.
  const avgRerankScore = rerankedChunks.length > 0
    ? rerankedChunks.reduce((sum, c) => sum + (c.rerankScore || 0), 0) / rerankedChunks.length
    : 0;
  const topRerankScore = rerankedChunks.length > 0
    ? (rerankedChunks[0]?.rerankScore || 0)
    : 0;
  const skipCRAGFastPath = avgRerankScore >= 6.5 || topRerankScore >= 8;

  const cragResult = (options.skipCRAG || skipCRAGFastPath)
    ? {
        docs: rerankedChunks,
        grade: {
          score: Math.max(topRerankScore, 7),
          isSufficient: true,
          reasoning: skipCRAGFastPath
            ? "CRAG fast-path: Initial rerank score is already high-confidence."
            : "CRAG skipped via options",
          missingInfo: "None",
          suggestedKeywords: [],
        },
        shouldRefuse: false,
        attempts: 0,
      }
    : await correctiveRetrieval(
        normalizedQuestion,
        rerankedChunks,
        activeSourceIds,
        userId,
        activeChannels,
        {
          conversationHistory,
          topN: strategyConfig.topN || 8,
          goodEnoughScore: 5,
          refuseBelowScore: 3,
          maxRetries: 1,
        }
      );
  timings.cragMs = Date.now() - t7;

  // =========================================================================
  // STEP 9: Parent Chunk Context Expansion
  // =========================================================================
  const t9 = Date.now();
  const finalExpandedDocs = options.skipParentExpansion
    ? cragResult.docs.map((d) => ({ ...d, content: d.pageContent }))
    : await expandParentChunks(
        cragResult.docs,
        userId,
        strategyConfig.preferParentChunks || false
      );
  timings.expansionMs = Date.now() - t9;
  timings.totalMs = Date.now() - pipelineStartTime;

  return {
    strategy: strategyConfig.strategy,
    shouldRetrieve: true,
    shouldRefuse: cragResult.shouldRefuse,
    docs: finalExpandedDocs,
    chunks: finalExpandedDocs, // Alias for backward compatibility
    grade: cragResult.grade,
    metadata: {
      strategy: strategyConfig.strategy,
      strategyReasoning: strategyConfig.reasoning,
      channelReasoning: channelDecision.reasoning,
      channels: Array.from(activeChannels),
      attempts: cragResult.attempts,
      queryVariants: queryVariants.allQueries,
      totalChannelsRetrieved: channelRankings.reduce(
        (acc, r) => acc + (r.results?.length || 0),
        0
      ),
      candidateCount: fusedCandidates.length,
      afterFloorCount: flooredCandidates.length,
      afterRerankCount: rerankedChunks.length,
      gradeScore: cragResult.grade?.score ?? null,
      refused: cragResult.shouldRefuse,
      finalSelectedCount: finalExpandedDocs.length,
      timings,
      optionsApplied: options,
    },
  };
}
