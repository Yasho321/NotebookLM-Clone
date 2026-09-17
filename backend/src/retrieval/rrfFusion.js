import { CHANNEL_WEIGHTS } from "./parallelSearcher.js";

// Fallback channel weights if not provided by the search task
const DEFAULT_WEIGHTS = {
  VECTOR: 1.5, // Primary signal — dense semantic matching
  HYDE: 1.2,   // Answer-shaped vector search key
  BM25: 0.8,   // Supplementary — exact keyword matching
};

/**
 * Weighted Reciprocal Rank Fusion (RRF).
 * Combines ranked lists from multiple search channels (Vector, BM25, HyDE)
 * into a single unified candidate list with strong preference for vector search.
 *
 * Formula:
 * Score(d) = Σ [ channelWeight * (1 / (k + rank + 1)) ]
 *
 * @param {Array<{ channel: string, weight?: number, query: string, results: Array }>} rankings - Output from parallelSearch
 * @param {object} options
 * @param {number} options.kRRF - RRF smoothing constant (default: 60 from Cormack et al.)
 * @param {number} options.topCandidates - Number of top fused chunks to return (default: 30, or 50 for broad summary)
 * @returns {Array<{ chunkId: string, parentChunkId: string, sourceId: string, pageContent: string, metadata: object, rrfScore: number, matchedChannels: string[] }>}
 */
export function weightedRRF(rankings, { kRRF = 60, topCandidates = 30 } = {}) {
  if (!Array.isArray(rankings) || rankings.length === 0) {
    return [];
  }

  const scores = new Map();         // chunkId -> cumulative RRF score
  const chunkMap = new Map();       // chunkId -> full chunk object (preserves text & metadata)
  const channelMatches = new Map(); // chunkId -> Set of channels that retrieved this chunk

  for (const item of rankings) {
    const { channel, weight: taskWeight, results } = item;
    if (!Array.isArray(results) || results.length === 0) continue;

    // Use channel weight prioritizing vector search (1.5x) over BM25 (0.8x)
    const weight = taskWeight || CHANNEL_WEIGHTS?.[channel] || DEFAULT_WEIGHTS[channel] || 1.0;

    for (let rank = 0; rank < results.length; rank++) {
      const doc = results[rank];
      if (!doc) continue;

      // Extract chunk ID whether doc is an object or a plain string
      const chunkId = typeof doc === "string" ? doc : doc.chunkId || doc._id?.toString() || doc.id;
      if (!chunkId) continue;

      // Cache full chunk content and metadata for downstream reranking
      if (typeof doc === "object" && !chunkMap.has(chunkId)) {
        chunkMap.set(chunkId, doc);
      }

      // Weighted RRF contribution: rank is 0-indexed, so denominator is (k + rank + 1)
      const rrfContribution = weight * (1 / (kRRF + rank + 1));
      const currentScore = scores.get(chunkId) || 0;
      scores.set(chunkId, currentScore + rrfContribution);

      // Record which channels agreed on this chunk
      if (!channelMatches.has(chunkId)) {
        channelMatches.set(chunkId, new Set());
      }
      channelMatches.get(chunkId).add(channel);
    }
  }

  // Sort chunks by total weighted RRF score descending
  const sortedChunks = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topCandidates);

  // Return full chunk objects with their computed RRF scores and channel agreement
  return sortedChunks.map(([chunkId, rrfScore]) => {
    const doc = chunkMap.get(chunkId) || { chunkId };
    return {
      chunkId,
      parentChunkId: doc.parentChunkId || null,
      sourceId: doc.sourceId || null,
      pageContent: doc.pageContent || "",
      metadata: doc.metadata || {
        sourceType: "text",
        originalFileName: "Untitled",
        pageNumber: 1,
        url: null,
      },
      rrfScore: parseFloat(rrfScore.toFixed(6)),
      matchedChannels: Array.from(channelMatches.get(chunkId) || []),
    };
  });
}
