import mongoose, { Schema } from "mongoose";

const chunkSchema = new Schema(
  {
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "Source",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Parent-Child hierarchy
    level: {
      type: String,
      enum: ["parent", "child"],
      default: "child",
      index: true,
    },
    parentChunkId: {
      type: Schema.Types.ObjectId,
      ref: "Chunk",
      default: null, // null if this chunk is itself a parent
      index: true,
    },
    pageContent: {
      type: String,
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    totalChunks: {
      type: Number,
    },
    // Citation & Evidence Metadata
    metadata: {
      sourceType: { type: String, enum: ["pdf", "docx", "csv", "text", "link", "text-paste"] },
      originalFileName: { type: String, default: null },
      pageNumber: { type: Number, default: null },      // e.g. Page 12 from PDF
      headingHierarchy: [{ type: String }],              // Section headers e.g. ["Chapter 2", "2.1 Pricing"]
      url: { type: String, default: null },              // For web links
      charCount: { type: Number },
    },
    qdrantPointId: {
      type: String, // Links the child chunk directly to Qdrant vector point
    },
  },
  { timestamps: true }
);

// Indexes for fast retrieval
chunkSchema.index({ sourceId: 1, level: 1 });
chunkSchema.index({ userId: 1, sourceId: 1 });
// Full-text index for native MongoDB keyword / BM25 search fallback
chunkSchema.index({ pageContent: "text" });

const Chunk = mongoose.model("Chunk", chunkSchema);
export default Chunk;
