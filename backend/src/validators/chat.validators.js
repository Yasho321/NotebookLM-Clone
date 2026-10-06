import { z } from "zod";

export const createChatSchema = z.object({
  sourceIds: z.array(z.string()).min(1, "At least one source is required"),
  title: z.string().max(200).optional().nullable(),
});

export const createMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
});

export const renameChatSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});
