import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";

export async function processWeb(url) {
  const loader = new CheerioWebBaseLoader(url, {
    maxConcurrency: 5,
  });

  const docs2 = await loader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 600,
    chunkOverlap: 0,
  });

  const chunks = await splitter.splitDocuments(docs2);

  return chunks;
}
