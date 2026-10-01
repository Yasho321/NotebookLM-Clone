import { batchVectorSearch } from "./vectorSearch.js";
import { batchBM25Search } from "./bm25Search.js";

/**
 * Channel weights giving strong preference to dense semantic vector search
 * while using BM25 as a targeted supplementary keyword signal.
 */
export const CHANNEL_WEIGHTS = {
  VECTOR: 1.5, // Primary signal — semantic comprehension
  HYDE: 1.2,   // High-quality answer-shaped vector search key
  BM25: 0.8,   // Supplementary — exact term matching
};

/**
 * Fans out query variants across selected search channels simultaneously.
 * Uses batchVectorSearch (1 single OpenAI embedding API trip for all queries including HyDE)
 * and batchBM25Search (1 single MongoDB fetch & in-memory index for all keyword queries).
 *
 * @param {object} queryVariants - Output from translateQuery ({ allQueries, hydeQuery, original })
 * @param {Set<string>|string[]} channels - Channels to query ('VECTOR', 'BM25')
 * @param {string[]|string} sourceIds - Selected user sources
 * @param {string} userId - User ID
 * @param {object} options - { k: number, exactTerms: string[] }
 * @returns {Promise<Array<{ channel: string, weight: number, query: string, results: Array }>>}
 */
export async function parallelSearch(
  queryVariants,
  channels,
  sourceIds,
  userId,
  { k = 10, exactTerms = [] } = {}
) {
  const activeChannels = channels instanceof Set ? channels : new Set(channels || ["VECTOR"]);

  // 1. Determine query variants to search:
  // For primary retrieval, focus on the top 2 highest-value representations (original + rewrite).
  // For targeted retries (e.g. CRAG where queryVariants has allQueries without rewrite), search allQueries.
  let queriesToSearch = [];
  if (queryVariants?.rewrite) {
    const candidates = [queryVariants.original, queryVariants.rewrite]
      .filter((q) => q && typeof q === "string" && q.trim())
      .map((q) => q.trim());
    queriesToSearch = [...new Set(candidates)];
  } else if (Array.isArray(queryVariants?.allQueries) && queryVariants.allQueries.length > 0) {
    queriesToSearch = queryVariants.allQueries.filter(
      (q) => q && typeof q === "string" && q.trim()
    );
  } else if (queryVariants?.original) {
    queriesToSearch = [queryVariants.original.trim()];
  } else if (typeof queryVariants === "string") {
    queriesToSearch = [queryVariants.trim()];
  }

  const batchTasks = [];

  // 2. Vector Channel: Batch all text queries + HyDE into a single OpenAI embedding call
  const hasVector = activeChannels.has("VECTOR");
  const hydeQuery =
    hasVector &&
    queryVariants?.hyde &&
    typeof queryVariants.hyde === "string" &&
    queryVariants.hyde.trim()
      ? queryVariants.hyde.trim()
      : null;

  const vectorQueries = hasVector
    ? [...queriesToSearch, ...(hydeQuery ? [hydeQuery] : [])]
    : [];

  if (hasVector && vectorQueries.length > 0) {
    const vectorTask = (async () => {
      const batchResults = await batchVectorSearch(vectorQueries, sourceIds, userId, { k });
      const channelEntries = [];

      for (let i = 0; i < queriesToSearch.length; i++) {
        channelEntries.push({
          channel: "VECTOR",
          weight: CHANNEL_WEIGHTS.VECTOR,
          query: queriesToSearch[i],
          results: batchResults[i] || [],
        });
      }

      if (hydeQuery && batchResults.length > queriesToSearch.length) {
        channelEntries.push({
          channel: "HYDE",
          weight: CHANNEL_WEIGHTS.HYDE,
          query: hydeQuery,
          results: batchResults[queriesToSearch.length] || [],
        });
      }

      return channelEntries;
    })();
    batchTasks.push(vectorTask);
  }

  // 3. BM25 Channel: Batch all text queries against a single in-memory OkapiBM25 index
  if (activeChannels.has("BM25") && queriesToSearch.length > 0) {
    const bm25Task = (async () => {
      const batchResults = await batchBM25Search(queriesToSearch, sourceIds, userId, {
        k,
        exactTerms,
      });
      return queriesToSearch.map((query, idx) => ({
        channel: "BM25",
        weight: CHANNEL_WEIGHTS.BM25,
        query,
        results: batchResults[idx] || [],
      }));
    })();
    batchTasks.push(bm25Task);
  }

  // Execute Vector & BM25 batches concurrently
  const batchOutputs = await Promise.all(batchTasks);
  return batchOutputs.flat();
}


