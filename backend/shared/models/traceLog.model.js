import mongoose, { Schema } from "mongoose";

const traceLogSchema = new Schema(
  {
    traceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      index: true,
    },
    query: {
      type: String,
      required: true,
    },
    response: {
      type: String,
      default: "",
    },
    events: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    duration: {
      type: Number, // total run duration in ms
      default: 0,
    },
    stepDurations: {
      memoryMs: { type: Number, default: 0 },
      retrievalMs: { type: Number, default: 0 },
      generationMs: { type: Number, default: 0 },
      translationMs: { type: Number, default: 0 },
      searchMs: { type: Number, default: 0 },
      fusionMs: { type: Number, default: 0 },
      floorMs: { type: Number, default: 0 },
      rerankMs: { type: Number, default: 0 },
      cragMs: { type: Number, default: 0 },
      expansionMs: { type: Number, default: 0 },
    },
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    error: {
      type: String,
      default: null,
    },
    retrievalMetrics: {
      strategy: { type: String, default: null },
      queryVariantsGenerated: { type: Number, default: 0 },
      channelsSearched: { type: [String], default: [] },
      chunksRetrieved: { type: Number, default: 0 },
      chunksAfterFloor: { type: Number, default: 0 },
      chunksAfterRerank: { type: Number, default: 0 },
      contextGradeScore: { type: Number, default: null },
      correctiveRetries: { type: Number, default: 0 },
      refused: { type: Boolean, default: false },
      selectedChunkIds: { type: [String], default: [] },
    },
    aiEvaluations: {
      faithfulness: {
        score: { type: Number, default: null }, // 0.0 to 1.0
        reasoning: { type: String, default: null },
        evaluatedAt: { type: Date, default: null },
      },
      answerRelevance: {
        score: { type: Number, default: null }, // 0.0 to 1.0
        reasoning: { type: String, default: null },
        evaluatedAt: { type: Date, default: null },
      },
      contextPrecision: {
        score: { type: Number, default: null }, // 0.0 to 1.0
        reasoning: { type: String, default: null },
        evaluatedAt: { type: Date, default: null },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Helpful index for timeline searches
traceLogSchema.index({ createdAt: -1 });
traceLogSchema.index({ userId: 1, createdAt: -1 });

const TraceLog = mongoose.model("TraceLog", traceLogSchema);

export default TraceLog;
