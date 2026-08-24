import mongoose, { Schema } from "mongoose";

const sourceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["pdf", "csv", "link", "text", "docx", "text-paste"],
      required: true,
    },
    status: {
      type: String,
      enum: ["uploading", "queued", "processing", "completed", "failed"],
      default: "uploading",
    },
    s3Key: {
      type: String,
      default: null,
    },
    originalFileName: {
      type: String,
      default: null,
    },
    mimeType: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    title: {
      type: String,
      default: null,
    },
    summary: {
      type: String,
      default: null,
    },
    textContent: {
      type: String,
      default: null,
    },
    webURL: {
      type: String,
      default: null,
    },
    rawURL: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const Source = mongoose.model("Source", sourceSchema);

export default Source;
