import { Document } from "@langchain/core/documents";
import Source from "../../shared/models/source.model.js";
import { processFile } from "./fileProcessor.js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import { processText } from "./textProcessor.js";
import { processWeb } from "./webProcessor.js";
import { ensurePayloadIndex } from "../../shared/libs/qdrant.js";
import crypto from "crypto";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import Chunk from "../../shared/models/chunk.model.js";

// Structured output schema for document title and executive summary
export const SourceSummarySchema = z.object({
  title: z
    .string()
    .describe("Clear, descriptive, human-readable title for the document inferred from content/headers"),
  summary: z
    .string()
    .describe(
      "Comprehensive, dense 2-3 paragraph executive summary of the document's core content, key findings, and practical takeaways"
    ),
});

// Agent SDK Document Summarizer Agent
const sourceSummarizerAgent = new Agent({
  name: "source-summarizer",
  model: "gpt-4.1-nano",
  outputType: SourceSummarySchema,
  instructions: `You are an expert document analysis and executive summarization engine for an AI research notebook.
Analyze the provided document macro-sections (which span the introduction, core sections, and conclusions) and generate:
1. title: A concise, human-readable title. If the document has a clear header or subject title, use it. Do not just output the raw file extension.
2. summary: A high-density executive summary covering the main topics, purpose, key findings, and practical conclusions. Be direct, authoritative, and informative.`,
});


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
        docs = await processFile(s3Key, mimeType,source.originalFileName); // Download from S3, parse
        break;
      case "text-paste": // Pasted text
        docs = await processText(typeSpecificData, source.originalFileName || "Pasted Note");
        break;
      case "link":
        docs = await processWeb(typeSpecificData);
        break;
      default:
        throw new Error(`Unsupported source type: ${type}`);
    }

    if (!docs || docs.length === 0) {
      throw new Error("No readable text content extracted from source");
    }

    const parentSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 3600, // ~900 tokens
      chunkOverlap: 600, // ~150 tokens
    });

     const childSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800, // ~200 tokens
      chunkOverlap: 200, // ~50 tokens
    });

    const parentDocs = await parentSplitter.splitDocuments(docs);

     const parentChunkInserts = parentDocs.map((pDoc, idx) => ({
      sourceId: source._id,
      userId: source.userId,
      level: "parent",
      parentChunkId: null,
      pageContent: pDoc.pageContent,
      chunkIndex: idx,
      totalChunks: parentDocs.length,
      metadata: {
        sourceType: pDoc.metadata?.sourceType || type,
        originalFileName: pDoc.metadata?.originalFileName || source.originalFileName || source.title || "Untitled",
        pageNumber: pDoc.metadata?.pageNumber || 1,
        headingHierarchy: pDoc.metadata?.headingHierarchy || [],
        url: pDoc.metadata?.url || source.webURL || null,
        charCount: pDoc.pageContent.length,
      },
    }));

    const savedParents = await Chunk.insertMany(parentChunkInserts);

    const childChunkInserts = [];
    let childGlobalIdx = 0;
    for (const parent of savedParents) {
      const childTexts = await childSplitter.splitText(parent.pageContent);
      for (const text of childTexts) {
        const trimmed = (text || "").trim();
        // Skip empty or trivial fragments (< 25 chars) that waste vector storage and pollute search
        if (trimmed.length < 25) continue;

        childChunkInserts.push({
          sourceId: source._id,
          userId: source.userId,
          level: "child",
          parentChunkId: parent._id,
          pageContent: trimmed,
          chunkIndex: childGlobalIdx++,
          metadata: {
            ...parent.toObject().metadata,
            charCount: trimmed.length,
          },
          qdrantPointId: crypto.randomUUID(),
        });
      }
    }
    const savedChildren = await Chunk.insertMany(childChunkInserts);


    const embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-large",
    });

    // 3. Split, embed, store in Qdrant (existing logic)
    const qdrantDocuments = savedChildren.map((child) => {
      return new Document({
        id: child.qdrantPointId,
        pageContent: child.pageContent,
        metadata: {
          // Mandatory multi-tenant isolation keys
          userId: userId.toString(),
          sourceId: source._id.toString(),
          // Relational pointers to MongoDB
          chunkId: child._id.toString(),
          parentChunkId: child.parentChunkId.toString(),
          level: "child",
          // Citation metadata
          sourceType: child.metadata?.sourceType || type,
          originalFileName: child.metadata?.originalFileName || "Untitled",
          pageNumber: child.metadata?.pageNumber || 1,
          url: child.metadata?.url || null,
        },
      });
    });


    await ensurePayloadIndex("notebookLM-Collection", "metadata.userId");
    await ensurePayloadIndex("notebookLM-Collection", "metadata.sourceId");
    await ensurePayloadIndex("notebookLM-Collection", "metadata.level");

    const vectorStore = await QdrantVectorStore.fromDocuments(
      qdrantDocuments,
      embeddings,
      {
        url: process.env.QUADRANT_URL,
        apiKey: process.env.QUADRANT_API_KEY,
        collectionName: "notebookLM-Collection",
      },
    );

    // 4. Macro-context assembly from parent chunks (matches BROAD_SUMMARY in retrieval)
    // Instead of querying random vector chunks, we sample representative macro sections
    // from the beginning (intro/abstract), middle, and end (conclusions) of the document.
    let summaryParentChunks = [];
    if (savedParents.length <= 8) {
      summaryParentChunks = savedParents;
    } else {
      const firstSection = savedParents.slice(0, 3);
      const lastSection = savedParents.slice(-2);
      const step = Math.floor(savedParents.length / 4);
      const midSection = [savedParents[step], savedParents[step * 2]].filter(Boolean);
      summaryParentChunks = [...firstSection, ...midSection, ...lastSection];
    }

    const summaryContext = summaryParentChunks
      .map(
        (p, idx) =>
          `[Section ${idx + 1} - Page ${p.metadata?.pageNumber || 1}]:\n${p.pageContent}`
      )
      .join("\n\n---\n\n");

    const prompt = `Original Filename: ${source.originalFileName || "Untitled"}\n\nDocument Macro-Sections:\n${summaryContext}`;

    // 5. Generate structured title and executive summary via Agent SDK
    const summaryResult = await run(sourceSummarizerAgent, prompt);
    const { title, summary } = summaryResult.finalOutput;

    const maxPages = Math.max(1, ...savedChildren.map((c) => c.metadata?.pageNumber || 1));

    await Source.findByIdAndUpdate(sourceId, {
      status: "completed",
      title: title || source.originalFileName || "Untitled",
      summary: summary || "",
      totalParentChunks: savedParents.length,
      totalChildChunks: savedChildren.length,
      totalPages: maxPages,
    });

  } catch (error) {
    await Source.findByIdAndUpdate(sourceId, {
      status: "failed",
      errorMessage: error.message.substring(0, 500),
    });
    throw error; // Let BullMQ handle retry
  }
}
