import { gradeContext } from "./contextGrader.js";
import { parallelSearch } from "./parallelSearcher.js";
import { weightedRRF } from "./rrfFusion.js";
import { applyRelevanceFloor } from "./relevanceFloor.js";
import { rerank } from "./reRanker.js";

/**
 * Default threshold parameters for Corrective RAG (CRAG)
 */
export const CRAG_CONFIG = {
  MAX_RETRIES: 1,       // Maximum corrective retrieval rounds (capped to 1 to avoid compounding latency)
  GOOD_ENOUGH: 5,       // Score (0-10) threshold to stop corrective search
  REFUSE_BELOW: 3,      // Score threshold below which model should refuse / express uncertainty
  DEFAULT_TOP_N: 8,     // Number of top chunks to preserve after reranking
};

/**
 * Corrective RAG (CRAG) Retrieval Loop.
 *
 * When initial retrieval yields incomplete or insufficient context, this loop
 * diagnoses what information is missing and dispatches targeted searches for the
 * missing facts rather than blindly repeating the original query.
 *
 * Key guarantees:
 * 1. Targeted Missing Fact Search: Uses the grader's suggested keywords.
 * 2. Information Preservation: Combines newly retrieved chunks with earlier good chunks.
 * 3. Monotonic Quality (Best-Round Retention): Only adopts a retry round if the score strictly improves.
 * 4. Hallucination Refusal Flag: Marks `shouldRefuse = true` if the best context is still below the threshold.
 *
 * @param {string} question - The user's query
 * @param {Array<object>} initialDocs - Initial reranked chunks from the first retrieval pass
 * @param {string[]|string} sourceIds - Active user source document IDs
 * @param {string} userId - User ID for tenant isolation
 * @param {Set<string>|string[]} channels - Active search channels ('VECTOR', 'BM25')
 * @param {object} [options]
 * @param {Array<object>} [options.conversationHistory=[]] - Recent chat history for context
 * @param {number} [options.maxRetries=2] - Max corrective rounds
 * @param {number} [options.goodEnoughScore=6] - Sufficiency cutoff
 * @param {number} [options.refuseBelowScore=3] - Refusal cutoff
 * @param {number} [options.topN=8] - Target chunk count
 * @returns {Promise<{ docs: Array<object>, grade: object, shouldRefuse: boolean, attempts: number }>}
 */
export async function correctiveRetrieval(
  question,
  initialDocs = [],
  sourceIds,
  userId,
  channels,
  {
    conversationHistory = [],
    maxRetries = CRAG_CONFIG.MAX_RETRIES,
    goodEnoughScore = CRAG_CONFIG.GOOD_ENOUGH,
    refuseBelowScore = CRAG_CONFIG.REFUSE_BELOW,
    topN = CRAG_CONFIG.DEFAULT_TOP_N,
  } = {}
) {
  let bestDocs = Array.isArray(initialDocs) ? initialDocs : [];
  let bestGrade = await gradeContext(question, bestDocs, conversationHistory);
  let attempts = 0;

  // If initial context is already sufficient, exit immediately
  if (bestGrade.score >= goodEnoughScore) {
    return {
      docs: bestDocs,
      grade: bestGrade,
      shouldRefuse: bestGrade.score < refuseBelowScore,
      attempts: 0,
    };
  }

  // Active corrective search loop
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const missingKeywords = bestGrade.suggestedKeywords || [];
    if (!missingKeywords.length) {
      break; // No actionable keywords suggested to search for missing facts
    }

    attempts++;

    // 1. Construct targeted search queries focused on what is MISSING
    const retryQueries = [question, ...missingKeywords];

    // 2. Parallel search across active channels for the missing keywords
    const retryResults = await parallelSearch(
      { allQueries: retryQueries, original: question },
      channels,
      sourceIds,
      userId,
      { k: 15, exactTerms: missingKeywords }
    );

    // 3. Fuse and filter the newly retrieved candidate chunks
    const fused = weightedRRF(retryResults, { topCandidates: 30 });
    const floored = applyRelevanceFloor(fused);

    // 4. Merge newly retrieved chunks with best previous chunks (deduplicated by ID)
    // This prevents losing previously found facts when retrieving missing secondary facts
    const candidateMap = new Map();
    for (const doc of bestDocs) {
      const id = doc.chunkId || doc._id?.toString() || doc.id;
      if (id) candidateMap.set(id, doc);
    }
    for (const doc of floored) {
      const id = doc.chunkId || doc._id?.toString() || doc.id;
      if (id && !candidateMap.has(id)) {
        candidateMap.set(id, doc);
      }
    }
    const combinedCandidates = Array.from(candidateMap.values());

    // 5. Rerank the pooled candidate set with MMR diversity
    const reranked = await rerank(question, combinedCandidates, {
      conversationHistory,
      topN,
    });

    // 6. Grade the updated context package
    const currentGrade = await gradeContext(question, reranked, conversationHistory);

    // 7. Retain the BEST round, not the LAST round (correction can occasionally dilute quality)
    if (currentGrade.score > bestGrade.score) {
      bestGrade = currentGrade;
      bestDocs = reranked;
    }

    // Stop early if we achieved sufficient quality
    if (bestGrade.score >= goodEnoughScore) {
      break;
    }
  }

  return {
    docs: bestDocs,
    grade: bestGrade,
    shouldRefuse: bestGrade.score < refuseBelowScore,
    attempts,
  };
}
