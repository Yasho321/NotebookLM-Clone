import mongoose, { Schema } from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"], // optional system role too
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    citations: [
      {
        sourceId: { type: Schema.Types.ObjectId, ref: "Source" },
        originalFileName: String,
        pageNumber: Number,
        chunkId: { type: Schema.Types.ObjectId, ref: "Chunk" },
        snippet: String,
      }
    ]

  },
  { _id: false }, // prevent _id for each message
);

const chatSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sourceIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Source" }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one source is required",
      },
    },
    title: {
      type: String,
      default: null, // Optional chat title, auto-generated or user-set
    },
    rollingSummary: {
      type: String,
      default: null, // Holds the compressed summary of older messages
    },
    messages: {
      type: [messageSchema],
      required: true,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

chatSchema.index({ userId: 1, updatedAt: -1 });

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;
