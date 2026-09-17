import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { Document } from "@langchain/core/documents";

export async function processWeb(url) {
  const loader = new CheerioWebBaseLoader(url, {
    maxConcurrency: 5,
  });

  const docs = await loader.load();

  if (!docs || docs.length === 0) {
    throw new Error(`Failed to load content from URL: ${url}`);
  }
  // Extract page title or fallback to hostname
  let pageTitle = docs[0]?.metadata?.title;
  if (!pageTitle || !pageTitle.trim()) {
    try {
      pageTitle = new URL(url).hostname;
    } catch {
      pageTitle = "Web Article";
    }
  }
  return docs.map((doc, idx) => {
    return new Document({
      pageContent: doc.pageContent,
      metadata: {
        sourceType: "link",
        originalFileName: pageTitle.trim(),
        url: url,
        pageNumber: idx + 1,
        headingHierarchy: [],
      },
    });
  });
}
