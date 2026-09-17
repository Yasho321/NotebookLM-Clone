import { Router } from 'express';
import { isLoggedIn } from '../middlewares/auth.middlewares.js';
import {
  createChat,
  listChats,
  createMessage,
  getChat,
  stopGeneration,
  regenerateMessage,
  savePartialResponse,
} from '../controllers/chat.controllers.js';

const router = Router();

// ── Collection-level routes (no params) ──────────────────────────────────────
// Create a new chat with selected sources
router.post("/", isLoggedIn, createChat);

// List all chats for the authenticated user
router.get("/", isLoggedIn, listChats);

// ── Chat-specific sub-routes (must come BEFORE generic /:chatId) ─────────────
// Stop an in-flight generation
router.post("/:chatId/stop", isLoggedIn, stopGeneration);

// Regenerate the last assistant message (SSE)
router.post("/:chatId/regenerate", isLoggedIn, regenerateMessage);

// Save a partial response after the user stops generation
router.post("/:chatId/save-partial", isLoggedIn, savePartialResponse);

// Send a message and stream response (SSE)
router.post("/:chatId/message", isLoggedIn, createMessage);

// ── Generic chat-level routes ────────────────────────────────────────────────
// Fetch a single chat with full message history
router.get("/:chatId", isLoggedIn, getChat);

export default router;