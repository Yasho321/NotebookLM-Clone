import "../../shared/libs/env.js";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import User from "../../shared/models/user.model.js";
import { executeCypher } from "../../shared/libs/neo4j.js";

// 1. Zod schema for batch memory extraction (both factual & episodic)
export const MemoryBatchSchema = z.object({
  hasLongTermMemory: z
    .boolean()
    .describe("Whether the conversation batch contains any durable memory about the user"),
  factualMemories: z
    .array(z.string())
    .describe(
      "Durable factual statements about the user (e.g. 'User is a backend engineer at Google', 'Favorite food is Pav Bhaji', 'Turned vegetarian'). Exclude temporary chatter."
    ),
  episodicMemories: z
    .array(
      z.object({
        summary: z
          .string()
          .describe(
            "Self-contained episodic sentence for semantic vector search (e.g. 'User traveled to Manali for trekking last summer', 'User watched the movie Interstellar last weekend')."
          ),
        cypherQuery: z
          .string()
          .describe(
            "Executable Neo4j Cypher statement with $userId parameter. Must MERGE nodes and relationships. Example: MERGE (u:User {id: $userId}) MERGE (p:Place {name: 'Manali'}) MERGE (u)-[r:traveledTo]->(p) ON CREATE SET r.event = 'Trekking' RETURN u, p, r"
          ),
        eventName: z.string().describe("Short event identifier"),
      })
    )
    .describe(
      "Narrative episodic events, trips, completed actions, or milestone experiences with Cypher queries"
    ),
});

// 2. Define the Agent SDK Memory Batch Extraction Agent
const memoryExtractorAgent = new Agent({
  name: "memory-batch-extractor",
  model: "gpt-4.1-mini",
  outputType: MemoryBatchSchema,
  instructions: `You are an expert cognitive memory extraction engine for a personal AI research notebook.
Analyze the provided batch of conversation messages (up to 40 turns) between the user and assistant.
Extract durable long-term memories belonging to the USER.

Classify memory into two distinct tiers:

1. FACTUAL MEMORIES (Saved to User Profile):
   - Enduring static traits, roles, identities, dietary choices, tech stacks, or explicit preferences.
   - Format: Concise declarative third-person statements (e.g. "User is a backend developer at Google", "User's favorite color is blue", "User turned vegetarian").
   - DO NOT include general document queries, math questions, or generic code questions.

2. EPISODIC MEMORIES (Saved to Neo4j Graph + Qdrant Vector Memory):
   - Narrative experiences, past events, completed milestones, or specific activities the user experienced.
   - For each event:
     a) 'summary': A clean, noise-free sentence for semantic vector embedding (e.g. "User traveled to Manali for trekking last summer").
     b) 'cypherQuery': A robust Cypher query that links the user to the entities.
        - Must use the parameter $userId.
        - Use MERGE for nodes to prevent duplication.
        - Common labels: User, Place, Movie, Book, Dish, Organization, Project, Technology.
        - Example:
          MERGE (u:User {id: $userId})
          MERGE (place:Place {name: 'Manali'})
          MERGE (u)-[r:traveledTo]->(place)
          ON CREATE SET r.event = 'Trekking', r.season = 'Summer'
          RETURN u, place, r

If the conversation contains ONLY document Q&A or pleasantries without user personal details, set hasLongTermMemory = false, factualMemories = [], and episodicMemories = [].`,
});

// Singleton embeddings for episodic vector memory
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
});

/**
 * BullMQ processor for extracting long-term memories from a 40-message conversation batch.
 * Concurrently extracts factual memories (MongoDB) and episodic memories (Neo4j + Qdrant).
 *
 * @param {object} job - BullMQ job containing { userId, chatId, messages, messageCount }
 * @returns {Promise<{ success: boolean, factualCount: number, episodicCount: number }>}
 */
export async function processMemoryExtraction(job) {
  const { userId, chatId, messages = [], messageCount } = job.data;

  if (!userId) {
    throw new Error("[memoryProcessor] Missing userId in job data");
  }

  // 1. Fetch current graph schema context for this user to help Cypher generation
  let existingGraphContext = "";
  try {
    const graphRes = await executeCypher(
      `
      MERGE (u:User {id: $userId})
      WITH u
      OPTIONAL MATCH (u)-[r*1..2]-(n)
      RETURN u, r, n LIMIT 20
      `,
      { userId: userId.toString() }
    );

    const relDescriptions = [];
    for (const record of graphRes.records || []) {
      const rels = record.get("r");
      const node = record.get("n");
      if (rels && node) {
        relDescriptions.push(
          `Connected: ${JSON.stringify(node.properties)} via ${rels.map((r) => r.type).join(" -> ")}`
        );
      }
    }
    existingGraphContext = relDescriptions.join("\n");
  } catch (err) {
    console.warn("⚠️ [memoryProcessor] Could not fetch existing Neo4j context:", err.message);
  }

  // 2. Format the 40-message dialogue batch
  const dialogue = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const prompt = existingGraphContext
    ? `EXISTING USER GRAPH RELATIONSHIPS:\n${existingGraphContext}\n\nCONVERSATION BATCH (40 MESSAGES TO ANALYZE FOR USER MEMORIES):\n${dialogue}`
    : `CONVERSATION BATCH (40 MESSAGES TO ANALYZE FOR USER MEMORIES):\n${dialogue}`;

  try {
    // 3. Single structured LLM call via Agent SDK replacing up to 5 sequential legacy calls
    const result = await run(memoryExtractorAgent, prompt);
    const { hasLongTermMemory, factualMemories = [], episodicMemories = [] } =
      result.finalOutput;

    if (!hasLongTermMemory && factualMemories.length === 0 && episodicMemories.length === 0) {
      console.log(
        `ℹ️ [memoryProcessor] No long-term memories detected in batch for user ${userId} at ${messageCount} msgs.`
      );
      return { success: true, factualCount: 0, episodicCount: 0 };
    }

    const tasks = [];

    // 4. Persist Factual Memories to MongoDB User profile (deduplicated via $addToSet)
    if (factualMemories.length > 0) {
      tasks.push(
        User.findByIdAndUpdate(
          userId,
          {
            $addToSet: { facts: { $each: factualMemories } },
          },
          { new: true, upsert: true }
        ).then(() => {
          console.log(
            `🧠 [memoryProcessor] Saved ${factualMemories.length} factual memories for user ${userId}`
          );
        })
      );
    }

    // 5. Persist Episodic Memories to Neo4j Graph
    if (episodicMemories.length > 0) {
      for (const ep of episodicMemories) {
        if (ep.cypherQuery && ep.cypherQuery.trim()) {
          tasks.push(
            executeCypher(ep.cypherQuery, { userId: userId.toString() })
              .then(() => {
                console.log(
                  `🕸️ [memoryProcessor] Executed Neo4j Cypher for event: ${ep.eventName || "event"}`
                );
              })
              .catch((err) => {
                console.warn(
                  `⚠️ [memoryProcessor] Cypher execution failed for ${ep.eventName}:`,
                  err.message
                );
              })
          );
        }
      }

      // 6. Persist Episodic Memory summaries to Qdrant Vector Store
      const episodicDocs = episodicMemories
        .filter((ep) => ep.summary && ep.summary.trim())
        .map(
          (ep) =>
            new Document({
              pageContent: ep.summary,
              metadata: {
                userId: userId.toString(),
                chatId: chatId ? chatId.toString() : null,
                type: "episodic",
                eventName: ep.eventName || "event",
              },
            })
        );

      if (episodicDocs.length > 0) {
        tasks.push(
          QdrantVectorStore.fromDocuments(episodicDocs, embeddings, {
            url: process.env.QUADRANT_URL,
            apiKey: process.env.QUADRANT_API_KEY,
            collectionName: "memory-notebookLM-Collection",
          }).then(() => {
            console.log(
              `📦 [memoryProcessor] Embedded ${episodicDocs.length} episodic memories into Qdrant.`
            );
          })
        );
      }
    }

    // Await all storage tasks concurrently
    await Promise.all(tasks);

    console.log(
      `✅ [memoryProcessor] Memory extraction complete: ${factualMemories.length} facts, ${episodicMemories.length} episodes.`
    );

    return {
      success: true,
      factualCount: factualMemories.length,
      episodicCount: episodicMemories.length,
    };
  } catch (error) {
    console.error(
      `❌ [memoryProcessor] Error processing memory batch for user ${userId}:`,
      error
    );
    throw error;
  }
}
