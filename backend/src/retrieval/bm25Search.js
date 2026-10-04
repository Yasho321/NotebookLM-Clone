import Chunk from "../../shared/models/chunk.model.js";

/**
 * Tokenizes text into lowercase words/terms for BM25 matching.
 * Preserves alphanumeric words, underscores, and hyphens (useful for error codes & IDs).
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s\-_.]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1);
}

/**
 * In-memory Okapi BM25 implementation.
 * Fast, self-contained, zero-dependency keyword search across MongoDB chunks.
 */
class OkapiBM25 {
  constructor(documents, { k1 = 1.2, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.documents = documents;
    this.corpusSize = documents.length;

    this.docLengths = new Float64Array(this.corpusSize);
    this.docFreqs = new Map(); // term -> count of docs containing term
    this.invertedIndex = new Map(); // term -> Array<{ docIdx: number, tf: number }>

    let totalLength = 0;

    for (let i = 0; i < this.corpusSize; i++) {
      const tokens = tokenize(documents[i].pageContent);
      const len = tokens.length;
      this.docLengths[i] = len;
      totalLength += len;

      // Count term frequencies within this document
      const termFreqs = new Map();
      for (let t = 0; t < len; t++) {
        const term = tokens[t];
        termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
      }

      // Populate document frequencies and inverted index postings
      for (const [term, tf] of termFreqs.entries()) {
        this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1);

        let postings = this.invertedIndex.get(term);
        if (!postings) {
          postings = [];
          this.invertedIndex.set(term, postings);
        }
        postings.push({ docIdx: i, tf });
      }
    }

    this.avgDocLength = this.corpusSize > 0 ? totalLength / this.corpusSize : 1;
  }

  /**
   * Computes Inverse Document Frequency (IDF) for a term.
   */
  idf(term) {
    const docFreq = this.docFreqs.get(term) || 0;
    return Math.log((this.corpusSize - docFreq + 0.5) / (docFreq + 0.5) + 1);
  }

  /**
   * Scores documents against a query string using the inverted index.
   * Only visits documents that actually contain query terms.
   *
   * @param {string} query
   * @param {string[]} exactTerms - Optional verbatim keywords extracted by queryRouter
   * @returns {Array<{ chunk: object, score: number }>}
   */
  search(query, exactTerms = []) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.corpusSize === 0) return [];

    // Accumulate scores only for documents containing at least one query term
    const candidateScores = new Map();

    for (const qTerm of queryTokens) {
      const postings = this.invertedIndex.get(qTerm);
      if (!postings || postings.length === 0) continue;

      const idfVal = this.idf(qTerm);
      const idfWeight = idfVal * (this.k1 + 1);

      for (let p = 0; p < postings.length; p++) {
        const { docIdx, tf } = postings[p];
        const docLength = this.docLengths[docIdx];
        const denominator =
          tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));

        const scoreContrib = idfWeight * (tf / denominator);
        candidateScores.set(
          docIdx,
          (candidateScores.get(docIdx) || 0) + scoreContrib
        );
      }
    }

    if (candidateScores.size === 0) return [];

    const scores = [];

    for (const [docIdx, bm25Score] of candidateScores.entries()) {
      let finalScore = bm25Score;
      const doc = this.documents[docIdx];

      // Verbatim exact-term match bonus (e.g. error codes, specific model names)
      if (exactTerms.length > 0) {
        const contentLower = doc.pageContent.toLowerCase();
        for (const exact of exactTerms) {
          if (exact && contentLower.includes(exact.toLowerCase())) {
            finalScore *= 1.5; // 50% boost for verbatim phrase match
          }
        }
      }

      if (finalScore > 0) {
        scores.push({ chunk: doc, score: finalScore });
      }
    }

    return scores.sort((a, b) => b.score - a.score);
  }
}

/**
 * Executes BM25 keyword search across MongoDB chunks for selected sources.
 * @param {string} query - The search query.
 * @param {string[]|string} sourceIds - Selected source IDs.
 * @param {string} userId - User ID for tenant filtering.
 * @param {object} options - { k: number, exactTerms: string[] }
 * @returns {Promise<Array<{ chunkId: string, parentChunkId: string, sourceId: string, score: number, pageContent: string, metadata: object }>>}
 */
// In-memory cache for OkapiBM25 instances keyed by `${userId}:${sortedSourceIds}`
const bm25Cache = new Map();
const BM25_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

async function getOrBuildBM25Index(normalizedSourceIds, userId) {
  const cacheKey = `${userId}:${[...normalizedSourceIds].sort().join(",")}`;
  const now = Date.now();
  const cached = bm25Cache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.bm25;
  }

  const candidateChunks = await Chunk.find({
    sourceId: { $in: normalizedSourceIds },
    userId: userId.toString(),
    level: "child",
  })
    .select("_id parentChunkId sourceId pageContent metadata")
    .lean();

  if (!candidateChunks || candidateChunks.length === 0) {
    return null;
  }

  const bm25 = new OkapiBM25(candidateChunks);

  if (bm25Cache.size > 100) {
    const oldestKey = bm25Cache.keys().next().value;
    bm25Cache.delete(oldestKey);
  }

  bm25Cache.set(cacheKey, {
    bm25,
    expiresAt: now + BM25_CACHE_TTL_MS,
  });

  return bm25;
}

export async function bm25Search(
  query,
  sourceIds,
  userId,
  { k = 10, exactTerms = [] } = {}
) {
  if (!query || !query.trim()) return [];

  const normalizedSourceIds = (Array.isArray(sourceIds) ? sourceIds : [sourceIds])
    .filter(Boolean)
    .map((id) => id.toString());

  if (normalizedSourceIds.length === 0) return [];

  try {
    const bm25 = await getOrBuildBM25Index(normalizedSourceIds, userId);
    if (!bm25) return [];

    const ranked = bm25.search(query, exactTerms);

    return ranked.slice(0, k).map(({ chunk, score }) => ({
      chunkId: chunk._id.toString(),
      parentChunkId: chunk.parentChunkId ? chunk.parentChunkId.toString() : null,
      sourceId: chunk.sourceId ? chunk.sourceId.toString() : null,
      score: score,
      pageContent: chunk.pageContent,
      metadata: chunk.metadata || {
        sourceType: "text",
        originalFileName: "Untitled",
        pageNumber: 1,
        url: null,
      },
    }));
  } catch (error) {
    console.error("❌ BM25 keyword search failed:", error);
    return [];
  }
}

/**
 * Executes BM25 keyword search for multiple queries using a SINGLE shared corpus fetch & index.
 * Eliminates duplicate MongoDB queries and duplicate tokenization when searching multiple variants.
 *
 * @param {string[]} queries - Array of search query strings
 * @param {string[]|string} sourceIds - Selected source IDs
 * @param {string} userId - User ID for tenant filtering
 * @param {object} options - { k: number, exactTerms: string[] }
 * @returns {Promise<Array<Array<object>>>} Array of result sets, one per input query
 */
export async function batchBM25Search(
  queries = [],
  sourceIds,
  userId,
  { k = 10, exactTerms = [] } = {}
) {
  const validQueries = queries.filter((q) => q && typeof q === "string" && q.trim());
  if (validQueries.length === 0) return [];

  const normalizedSourceIds = (Array.isArray(sourceIds) ? sourceIds : [sourceIds])
    .filter(Boolean)
    .map((id) => id.toString());

  if (normalizedSourceIds.length === 0) return validQueries.map(() => []);

  try {
    const bm25 = await getOrBuildBM25Index(normalizedSourceIds, userId);
    if (!bm25) {
      return validQueries.map(() => []);
    }

    // Score all queries against the pre-built index in <1ms each
    return validQueries.map((query) => {
      const ranked = bm25.search(query, exactTerms);
      return ranked.slice(0, k).map(({ chunk, score }) => ({
        chunkId: chunk._id.toString(),
        parentChunkId: chunk.parentChunkId ? chunk.parentChunkId.toString() : null,
        sourceId: chunk.sourceId ? chunk.sourceId.toString() : null,
        score: score,
        pageContent: chunk.pageContent,
        metadata: chunk.metadata || {
          sourceType: "text",
          originalFileName: "Untitled",
          pageNumber: 1,
          url: null,
        },
      }));
    });
  } catch (error) {
    console.error("❌ Batch BM25 keyword search failed:", error);
    return validQueries.map(() => []);
  }
}

