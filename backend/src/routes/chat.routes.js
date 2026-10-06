import { Router } from 'express';
import { isLoggedIn } from '../middlewares/auth.middlewares.js';
import { chatLimiter } from '../middlewares/rateLimit.middlewares.js';
import { validate } from '../middlewares/validate.middlewares.js';
import { createChatSchema, createMessageSchema, renameChatSchema } from '../validators/chat.validators.js';
import {
  createChat,
  listChats,
  createMessage,
  getChat,
  stopGeneration,
  regenerateMessage,
  savePartialResponse,
  renameChat,
  deleteChat,
  togglePinChat,
  setMessageFeedback,
} from '../controllers/chat.controllers.js';

const router = Router();

// ── Collection-level routes (no params) ──────────────────────────────────────
// Create a new chat with selected sources
router.post("/", isLoggedIn, validate(createChatSchema), createChat);

// List all chats for the authenticated user
router.get("/", isLoggedIn, listChats);

// ── Chat-specific sub-routes (must come BEFORE generic /:chatId) ─────────────
// Stop an in-flight generation
router.post("/:chatId/stop", isLoggedIn, stopGeneration);

// Regenerate the last assistant message (SSE)
router.post("/:chatId/regenerate", isLoggedIn, chatLimiter, regenerateMessage);

// Save a partial response after the user stops generation
router.post("/:chatId/save-partial", isLoggedIn, savePartialResponse);

// Toggle pin state (specific route — must come before generic /:chatId)
router.patch("/:chatId/pin", isLoggedIn, togglePinChat);

// Rate an assistant message (👍/👎)
router.post("/:chatId/feedback", isLoggedIn, setMessageFeedback);

// Send a message and stream response (SSE)
router.post("/:chatId/message", isLoggedIn, chatLimiter, validate(createMessageSchema), createMessage);

// ── Generic chat-level routes ────────────────────────────────────────────────
// Fetch a single chat with full message history
router.get("/:chatId", isLoggedIn, getChat);

// Rename a chat
router.patch("/:chatId", isLoggedIn, validate(renameChatSchema), renameChat);

// Delete a chat
router.delete("/:chatId", isLoggedIn, deleteChat);

export default router;