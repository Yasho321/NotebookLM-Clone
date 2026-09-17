import mongoose, { Schema } from "mongoose";

const goldenCaseSchema = new Schema(
  {
    question: {
      type: String,
      required: true,
    },
    groundTruthAnswer: {
      type: String,
      required: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "Source",
    },
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: "Chunk",
    },
    groundTruthContext: {
      type: String,
      default: "",
    },
  },
  { _id: true }
);

const goldenDatasetSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      default: "Golden Q&A Benchmark",
    },
    description: {
      type: String,
      default: "Curated ground truth QA dataset for RAG evaluations",
    },
    sourceIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Source" }],
      default: [],
    },
    testCases: {
      type: [goldenCaseSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

goldenDatasetSchema.index({ createdAt: -1 });

const GoldenDataset = mongoose.model("GoldenDataset", goldenDatasetSchema);

export default GoldenDataset;
