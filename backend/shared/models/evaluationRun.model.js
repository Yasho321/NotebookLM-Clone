import mongoose, { Schema } from "mongoose";

const variantMetricsSchema = new Schema(
  {
    latencyMs: { type: Number, default: 0 },
    hitRate: { type: Number, default: 0 },
    mrr: { type: Number, default: 0 },
    precisionAtK: { type: Number, default: 0 },
    gradeScore: { type: Number, default: 0 },
    chunksCount: { type: Number, default: 0 },
    topSnippet: { type: String, default: "" },
  },
  { _id: false }
);

const variantSummarySchema = new Schema(
  {
    avgLatencyMs: { type: Number, default: 0 },
    avgHitRate: { type: Number, default: 0 },
    avgMRR: { type: Number, default: 0 },
    avgPrecisionAtK: { type: Number, default: 0 },
    avgGradeScore: { type: Number, default: 0 },
  },
  { _id: false }
);

const evaluationRunSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: "Retrieval Ablation Benchmark",
    },
    testQueries: {
      type: [String],
      required: true,
    },
    sourceIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Source" }],
      default: [],
    },
    variantsTested: {
      type: [String],
      default: ["full", "noRerank", "noHyde", "noBM25", "noCRAG", "noFloor"],
    },
    results: [
      {
        query: String,
        full: variantMetricsSchema,
        noRerank: variantMetricsSchema,
        noHyde: variantMetricsSchema,
        noBM25: variantMetricsSchema,
        noCRAG: variantMetricsSchema,
        noFloor: variantMetricsSchema,
      },
    ],
    summary: {
      full: variantSummarySchema,
      noRerank: variantSummarySchema,
      noHyde: variantSummarySchema,
      noBM25: variantSummarySchema,
      noCRAG: variantSummarySchema,
      noFloor: variantSummarySchema,
    },
  },
  {
    timestamps: true,
  }
);

evaluationRunSchema.index({ createdAt: -1 });

const EvaluationRun = mongoose.model("EvaluationRun", evaluationRunSchema);

export default EvaluationRun;
