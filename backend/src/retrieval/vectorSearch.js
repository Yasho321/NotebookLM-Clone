import "../../shared/libs/env.js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";

// Singleton embeddings instance using text-embedding-3-large
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
});

let vectorStoreInstance = null;

async function getVectorStore() {
  if (!vectorStoreInstance) {
    vectorStoreInstance = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: process.env.QUADRANT_URL,
        apiKey: process.env.QUADRANT_API_KEY,
        collectionName: "notebookLM-Collection",
      }
    );
  }
  return vectorStoreInstance;
}

/**
 * Performs semantic vector search in Qdrant with multi-tenant filtering.
 * @param {string} query - The search query (original, rewrite, stepBack, or HyDE).
 * @param {string[]|string} sourceIds - Array of selected source IDs or single source ID.
 * @param {string} userId - Current user ID for tenant isolation.
 * @param {object} options - Optional config: { k: number, filterLevel: 'child' }.
 * @returns {Promise<Array<{ chunkId: string, parentChunkId: string, score: number, pageContent: string, metadata: object }>>}
 */
export async function vectorSearch(query, sourceIds, userId, { k = 10, filterLevel = "child" } = {}) {
  if (!query || !query.trim()) return [];

  const vectorStore = await getVectorStore();

  // Normalize sourceIds into an array of string IDs
  const normalizedSourceIds = (Array.isArray(sourceIds) ? sourceIds : [sourceIds])
    .filter(Boolean)
    .map((id) => id.toString());

  if (normalizedSourceIds.length === 0) return [];

  // Build Qdrant payload filter
  const filterMust = [
    { key: "metadata.userId", match: { value: userId.toString() } },
  ];

  if (filterLevel) {
    filterMust.push({ key: "metadata.level", match: { value: filterLevel } });
  }

  if (normalizedSourceIds.length === 1) {
    filterMust.push({
      key: "metadata.sourceId",
      match: { value: normalizedSourceIds[0] },
    });
  } else {
    // Multi-source selection: match any of the selected source IDs
    filterMust.push({
      key: "metadata.sourceId",
      match: { any: normalizedSourceIds },
    });
  }

  try {
    // similaritySearchWithScore returns [Document, score]
    // Qdrant cosine similarity score ranges from 0.0 to 1.0 (higher is better)
    const resultsWithScore = await vectorStore.similaritySearchWithScore(
      query,
      k,
      { must: filterMust }
    );

    return resultsWithScore.map(([doc, score]) => {
      const metadata = doc.metadata || {};
      return {
        chunkId: metadata.chunkId || doc.id,
        parentChunkId: metadata.parentChunkId || null,
        sourceId: metadata.sourceId || null,
        score: typeof score === "number" ? score : 0,
        pageContent: doc.pageContent,
        metadata: {
          sourceType: metadata.sourceType || "text",
          originalFileName: metadata.originalFileName || "Untitled",
          pageNumber: metadata.pageNumber || 1,
          url: metadata.url || null,
        },
      };
    });
  } catch (error) {
    console.error("❌ Qdrant vector search failed:", error);
    return [];
  }
}

/**
 * Performs batch semantic vector search in Qdrant with a SINGLE OpenAI embedding API call.
 * Avoids multiple sequential/concurrent HTTPS round-trips from India to OpenAI US servers.
 *
 * @param {string[]} queries - Array of search query strings
 * @param {string[]|string} sourceIds - Selected source IDs
 * @param {string} userId - Current user ID
 * @param {object} options - { k: number, filterLevel: string }
 * @returns {Promise<Array<Array<object>>>} Array of result sets, one per input query
 */
export async function batchVectorSearch(
  queries = [],
  sourceIds,
  userId,
  { k = 10, filterLevel = "child" } = {}
) {
  const validQueries = queries.filter((q) => q && typeof q === "string" && q.trim());
  if (validQueries.length === 0) return [];

  const vectorStore = await getVectorStore();
  const normalizedSourceIds = (Array.isArray(sourceIds) ? sourceIds : [sourceIds])
    .filter(Boolean)
    .map((id) => id.toString());

  if (normalizedSourceIds.length === 0) {
    return validQueries.map(() => []);
  }

  const filterMust = [
    { key: "metadata.userId", match: { value: userId.toString() } },
  ];

  if (filterLevel) {
    filterMust.push({ key: "metadata.level", match: { value: filterLevel } });
  }

  if (normalizedSourceIds.length === 1) {
    filterMust.push({
      key: "metadata.sourceId",
      match: { value: normalizedSourceIds[0] },
    });
  } else {
    filterMust.push({
      key: "metadata.sourceId",
      match: { any: normalizedSourceIds },
    });
  }

  try {
    // 1 single HTTP request to OpenAI embeds all queries simultaneously
    const vectors = await embeddings.embedDocuments(validQueries);

    // Concurrently search Qdrant using the precomputed vectors
    const searchPromises = vectors.map(async (vector) => {
      const resultsWithScore = await vectorStore.similaritySearchVectorWithScore(
        vector,
        k,
        { must: filterMust }
      );
      return resultsWithScore.map(([doc, score]) => {
        const metadata = doc.metadata || {};
        return {
          chunkId: metadata.chunkId || doc.id,
          parentChunkId: metadata.parentChunkId || null,
          sourceId: metadata.sourceId || null,
          score: typeof score === "number" ? score : 0,
          pageContent: doc.pageContent,
          metadata: {
            sourceType: metadata.sourceType || "text",
            originalFileName: metadata.originalFileName || "Untitled",
            pageNumber: metadata.pageNumber || 1,
            url: metadata.url || null,
          },
        };
      });
    });

    return await Promise.all(searchPromises);
  } catch (error) {
    console.error("❌ Batch Qdrant vector search failed, falling back to individual:", error);
    return Promise.all(
      validQueries.map((q) => vectorSearch(q, sourceIds, userId, { k, filterLevel }))
    );
  }
}

