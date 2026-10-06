import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { Document } from "@langchain/core/documents";
import { assertSafeUrl } from "../../shared/libs/urlGuard.js";

export async function processWeb(url) {
  // Re-check at fetch time (defense in depth): guards against a DB value that was
  // never validated and against DNS rebinding since the request was first accepted.
  await assertSafeUrl(url);

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
