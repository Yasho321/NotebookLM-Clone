import { Document } from "@langchain/core/documents";
import Source from "../../shared/models/source.model.js";
import { processFile } from "./fileProcessor.js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { client } from "../../shared/libs/openai.js";
import { processText } from "./textProcessor.js";
import { processWeb } from "./webProcessor.js";
import { ensurePayloadIndex } from "../../shared/libs/qdrant.js";

export async function processSource(job) {
  const { sourceId, userId, type, s3Key, typeSpecificData, mimeType } =
    job.data;

  // 1. Update status to 'processing'
  const source = await Source.findByIdAndUpdate(sourceId, {
    status: "processing",
  });

  try {
    let docs;

    // 2. Get the raw content based on type
    switch (type) {
      case "pdf":
      case "docx":
      case "csv":
      case "text": // text file (not pasted text)
        docs = await processFile(s3Key, mimeType); // Download from S3, parse
        break;
      case "text-paste": // Pasted text
        docs = await processText(typeSpecificData);
        break;
      case "link":
        docs = await processWeb(typeSpecificData);
        break;
    }

    const embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-large",
    });

    // 3. Split, embed, store in Qdrant (existing logic)
    const documents = docs.map(
      (chunk) =>
        new Document({
          pageContent: chunk.pageContent,
          metadata: {
            userId: userId.toString(),
            sourceId: source._id.toString(),
          },
        }),
    );

    await ensurePayloadIndex("notebookLM-Collection", "metadata.userId");
    await ensurePayloadIndex("notebookLM-Collection", "metadata.sourceId");

    const vectorStore = await QdrantVectorStore.fromDocuments(
      documents,
      embeddings,
      {
        url: process.env.QUADRANT_URL,
        apiKey: process.env.QUADRANT_API_KEY,
        collectionName: "notebookLM-Collection",
      },
    );

    const vectorSearcher = vectorStore.asRetriever({
      k: 3,
      filter: {
        must: [
          { key: "metadata.userId", match: { value: userId.toString() } },
          { key: "metadata.sourceId", match: { value: source._id.toString() } },
        ],
      },
    });

    const userQuery = "Give me the title and summary of the document";

    const relevantChunk = await vectorSearcher.invoke(userQuery);
    const context = relevantChunk
      .map((chunk) => chunk.pageContent)
      .join("\n\n");

    const SYSTEM_PROMPT = `
            You are an AI assistant and an expert summarizer who helps the user give best title and best summary of the document based on the
            context available to you from document given.

            Only ans based on the available context from file only.

            Rule :- 
            - strictly answer only in json format and nothing else, no markdowns only json . 

            Output format :- 
            { title : string , summary : string }

            Context:
            ${JSON.stringify(context)}
        `;

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userQuery },
      ],
    });

    const rawContent = response.choices[0].message.content;
    const parsedContent = JSON.parse(rawContent);

    await Source.findByIdAndUpdate(sourceId, {
      status: "completed",
      title: parsedContent.title,
      summary: parsedContent.summary,
    });
  } catch (error) {
    await Source.findByIdAndUpdate(sourceId, {
      status: "failed",
      errorMessage: error.message.substring(0, 500),
    });
    throw error; // Let BullMQ handle retry
  }
}
