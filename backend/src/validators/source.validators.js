import { z } from "zod";

export const textSchema = z.object({
  text: z.string().min(1, "Text is required"),
});

export const webSchema = z.object({
  url: z.string().url("Enter a valid URL"),
});

export const presignSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileType: z.string().min(1, "File type is required"),
  fileSize: z
    .number({ invalid_type_error: "File size must be a number" })
    .positive("File size must be positive"),
});

export const confirmUploadSchema = z.object({
  sourceId: z.string().min(1, "Source ID is required"),
});

export const renameSourceSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});
