import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

export async function processText(text,title="Pasted Note") {
  console.log("🚀 Processing raw text paste...");
  if (!text || !text.trim()) {
    throw new Error("Text content is empty");
  }
  return [
    new Document({
      pageContent: text,
      metadata: {
        sourceType: "text-paste",
        originalFileName: title || "Pasted Note",
        pageNumber: 1,
        url: null,
        headingHierarchy: [],
      },
    }),
  ];
}
