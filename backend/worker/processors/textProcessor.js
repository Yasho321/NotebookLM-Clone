import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

export async function processText(text) {
  console.log("🚀 Processing raw text...");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const chunks = await splitter.splitText(text);

  return chunks.map((t) => ({ pageContent: t, metadata: {} }));
}
