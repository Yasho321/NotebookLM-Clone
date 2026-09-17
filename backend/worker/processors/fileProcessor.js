import { GetObjectCommand } from "@aws-sdk/client-s3";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { s3 } from "../../shared/libs/s3.js";
import { Document } from "@langchain/core/documents";

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function downloadFromS3(s3Key) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });

  const data = await s3.send(command);

  if (!data.Body) {
    throw new Error(`S3 object has no body: ${s3Key}`);
  }

  return streamToBuffer(data.Body);
}

function resolveSourceType(mimeType) {
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    return "docx";
  }
  if (mimeType === "text/csv") return "csv";
  return "text";
}

export async function processFile(s3Key, mimeType, originalFileName = null) {
  console.log("🚀 Processing file from S3:", s3Key, "Type:", mimeType);

  const buffer = await downloadFromS3(s3Key);

  // Node Buffer -> Blob
  const blob = new Blob([buffer], {
    type: mimeType,
  });

  let loader;

  switch (mimeType) {
    case "application/pdf":
      loader = new PDFLoader(blob);
      break;

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      loader = new DocxLoader(blob);
      break;

    case "text/csv":
      loader = new CSVLoader(blob);
      break;

    case "text/plain":
      loader = new TextLoader(blob);
      break;

    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const documents = await loader.load();
  const resolvedType = resolveSourceType(mimeType);
  const fileName = originalFileName || s3Key.split("-")[1];

  return documents.map((doc, idx) => {
    const pageNum = doc.metadata?.loc?.pageNumber || idx + 1;
    return new Document({
      pageContent: doc.pageContent,
      metadata: {
        sourceType: resolvedType,
        originalFileName: fileName,
        pageNumber: pageNum,
        url: null,
        headingHierarchy: [],
      },
    });
  });
}
