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
    ],
    // Links an assistant turn to its observability trace (for joining feedback → eval data).
    traceId: { type: String, default: null },
    // User rating of an assistant answer: "up" | "down" | null (not rated).
    feedback: { type: String, enum: ["up", "down", null], default: null },
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
      // NOTE: emptiness is allowed at the model level because a chat legitimately becomes
      // sourceless (and read-only) once all its sources are deleted. New-chat creation
      // still requires >= 1 source via the zod schema + controller check.
    },
    title: {
      type: String,
      default: null, // Optional chat title, auto-generated or user-set
    },
    pinned: {
      type: Boolean,
      default: false, // Pinned chats are sorted to the top of the list
    },
    isReadOnly: {
      type: Boolean,
      default: false, // Becomes true when ALL of a chat's sources have been deleted
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
