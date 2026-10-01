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

    // Precompute document lengths and average document length
    this.docTokens = [];
    let totalLength = 0;
    this.docFreqs = new Map(); // term -> count of docs containing term

    for (let i = 0; i < this.corpusSize; i++) {
      const tokens = tokenize(documents[i].pageContent);
      this.docTokens.push(tokens);
      totalLength += tokens.length;

      const uniqueInDoc = new Set(tokens);
      for (const term of uniqueInDoc) {
        this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1);
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
   * Scores all documents against a query string.
   * @param {string} query
   * @param {string[]} exactTerms - Optional verbatim keywords extracted by queryRouter
   * @returns {Array<{ chunk: object, score: number }>}
   */
  search(query, exactTerms = []) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.corpusSize === 0) return [];

    const scores = [];

    for (let i = 0; i < this.corpusSize; i++) {
      const tokens = this.docTokens[i];
      const docLength = tokens.length;
      const doc = this.documents[i];

      // Calculate term frequencies in this document
      const termFreqs = new Map();
      for (const t of tokens) {
        termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
      }

      let bm25Score = 0;

      for (const qTerm of queryTokens) {
        const tf = termFreqs.get(qTerm) || 0;
        if (tf === 0) continue;

        const idfVal = this.idf(qTerm);
        const numerator = tf * (this.k1 + 1);
        const denominator =
          tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));

        bm25Score += idfVal * (numerator / denominator);
      }

      // Verbatim exact-term match bonus (e.g. error codes, specific model names)
      if (exactTerms.length > 0) {
        const contentLower = doc.pageContent.toLowerCase();
        for (const exact of exactTerms) {
          if (exact && contentLower.includes(exact.toLowerCase())) {
            bm25Score *= 1.5; // 50% boost for verbatim phrase match
          }
        }
      }

      if (bm25Score > 0) {
        scores.push({ chunk: doc, score: bm25Score });
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
    // Fetch all child chunks belonging to the user's selected sources
    const candidateChunks = await Chunk.find({
      sourceId: { $in: normalizedSourceIds },
      userId: userId.toString(),
      level: "child",
    })
      .select("_id parentChunkId sourceId pageContent metadata")
      .lean();

    if (!candidateChunks || candidateChunks.length === 0) return [];

    const bm25 = new OkapiBM25(candidateChunks);
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
    // 1 single MongoDB query for all source chunks
    const candidateChunks = await Chunk.find({
      sourceId: { $in: normalizedSourceIds },
      userId: userId.toString(),
      level: "child",
    })
      .select("_id parentChunkId sourceId pageContent metadata")
      .lean();

    if (!candidateChunks || candidateChunks.length === 0) {
      return validQueries.map(() => []);
    }

    // 1 single in-memory OkapiBM25 index built for the request
    const bm25 = new OkapiBM25(candidateChunks);

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

