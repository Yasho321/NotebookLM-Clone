import { vectorSearch } from "./vectorSearch.js";
import { bm25Search } from "./bm25Search.js";

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
 * Each channel result list is tagged with its channel type and ranking weight
 * so downstream fusion (RRF) strongly prioritizes vector search.
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
  const searchTasks = [];

  // 1. Fan-out across all query variants (original, rewrite, stepBack, sub-questions)
  const queriesToSearch = queryVariants?.allQueries?.length
    ? queryVariants.allQueries
    : [queryVariants?.original || queryVariants];

  for (const query of queriesToSearch) {
    if (!query || !query.trim()) continue;

    // Vector Channel (Primary preference: weight = 1.5)
    if (activeChannels.has("VECTOR")) {
      searchTasks.push(
        (async () => {
          const results = await vectorSearch(query, sourceIds, userId, { k });
          return {
            channel: "VECTOR",
            weight: CHANNEL_WEIGHTS.VECTOR,
            query,
            results,
          };
        })()
      );
    }

    // BM25 Channel (Supplementary keyword signal: weight = 0.8)
    if (activeChannels.has("BM25")) {
      searchTasks.push(
        (async () => {
          const results = await bm25Search(query, sourceIds, userId, { k, exactTerms });
          return {
            channel: "BM25",
            weight: CHANNEL_WEIGHTS.BM25,
            query,
            results,
          };
        })()
      );
    }
  }

  // 2. HyDE search (Vector only — already answer-shaped, weight = 1.2)
  if (queryVariants?.hyde && activeChannels.has("VECTOR")) {
    searchTasks.push(
      (async () => {
        const results = await vectorSearch(queryVariants.hyde, sourceIds, userId, { k });
        return {
          channel: "HYDE",
          weight: CHANNEL_WEIGHTS.HYDE,
          query: queryVariants.hyde,
          results,
        };
      })()
    );
  }

  // Execute all channel searches in parallel
  const channelRankings = await Promise.all(searchTasks);

  return channelRankings;
}

