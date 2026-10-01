import "./env.js";
import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION_NAME = "notebookLM-Collection";

const qdrantClient = new QdrantClient({
  url: process.env.QUADRANT_URL,
  apiKey: process.env.QUADRANT_API_KEY,
});

export async function ensurePayloadIndex(collectionName, fieldName) {
  try {
    const collection = await qdrantClient.getCollection(collectionName);

    const payloadIndexes =
      collection.result?.payload_schema || collection.payload_schema || {};

    if (payloadIndexes[fieldName]) {
      console.log(`✅ Index already exists for ${fieldName}`);
      return;
    }

    console.log(`🔨 Creating index for ${fieldName}...`);

    await qdrantClient.createPayloadIndex(collectionName, {
      field_name: fieldName,
      field_schema: "keyword",
    });

    console.log(`✅ Created index for ${fieldName}`);
  } catch (err) {
    console.error(`❌ Failed while ensuring index ${fieldName}:`, err);
  }
}

/**
 * Initializes all required multi-tenant payload indexes across collections.
 */
export async function initQdrantIndexes() {
  await Promise.allSettled([
    ensurePayloadIndex("notebookLM-Collection", "metadata.userId"),
    ensurePayloadIndex("notebookLM-Collection", "metadata.sourceId"),
    ensurePayloadIndex("notebookLM-Collection", "metadata.level"),
    ensurePayloadIndex("memory-notebookLM-Collection", "metadata.userId"),
  ]);
}
