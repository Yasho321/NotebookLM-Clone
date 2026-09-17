/**
 * Applies a dynamic relevance floor to prune the weak tail of retrieved candidates.
 *
 * Why this is needed:
 * If 30 chunks are retrieved but only 5 are actually relevant, passing all 30
 * into the LLM reranker wastes tokens, increases latency, and risks context pollution.
 * Any chunk scoring below 25% of the top chunk's score is pruned before reranking.
 *
 * @param {Array<object>} fusedResults - Ranked chunk objects from weightedRRF (sorted descending by rrfScore)
 * @param {object} options
 * @param {number} options.ratio - Threshold multiplier of the best score (default: 0.25, i.e. 25%)
 * @param {number} options.minKeep - Minimum candidates to preserve regardless of score (default: 3)
 * @returns {Array<object>} Chunks passing the relevance floor
 */
export function applyRelevanceFloor(
  fusedResults,
  { ratio = 0.25, minKeep = 3 } = {}
) {
  if (!Array.isArray(fusedResults) || fusedResults.length === 0) {
    return [];
  }

  // Helper to safely extract score from chunk object or tuple format
  const getScore = (doc) => {
    if (!doc) return 0;
    if (typeof doc.rrfScore === "number") return doc.rrfScore;
    if (typeof doc.score === "number") return doc.score;
    if (Array.isArray(doc) && typeof doc[1] === "number") return doc[1];
    return 0;
  };

  const bestScore = getScore(fusedResults[0]);
  
  // If top score is invalid or 0, return minimum safe subset
  if (bestScore <= 0) {
    return fusedResults.slice(0, minKeep);
  }

  const threshold = bestScore * ratio;

  return fusedResults.filter((doc, index) => {
    // Safety guarantee: Always retain the top `minKeep` candidates for the reranker
    if (index < minKeep) return true;

    return getScore(doc) >= threshold;
  });
}
