import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Rate limiting protects against abuse and runaway cost.
 *
 * - Every chat message hits OpenAI, which costs real money. One script could drain
 *   your budget overnight without a limit.
 * - Login/register are brute-force targets, so they get a tighter limit.
 *
 * `standardHeaders` sends RateLimit-* headers so clients can see their remaining quota.
 */

// A misconfigured proxy can send "IP:PORT". The port changes per request (letting a
// client dodge the limit) and fails express-rate-limit's IP validation, so strip it.
const clientIp = (req) => {
  const ip = req.ip || "";
  const v4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  return v4WithPort ? v4WithPort[1] : ip;
};

// ipKeyGenerator groups IPv6 clients by subnet so they can't rotate addresses to escape.
const ipKey = (req) => ipKeyGenerator(clientIp(req));

// Generous catch-all for normal API traffic.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // ~40 req/min sustained
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  message: { success: false, message: "Too many requests, please slow down." },
});

// Tight limit for credential endpoints to blunt brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count toward the limit
  keyGenerator: ipKey,
  message: { success: false, message: "Too many attempts, please try again later." },
});

// Per-user limit for the expensive LLM endpoints (keyed by authenticated user id).
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || ipKey(req),
  message: { success: false, message: "You're sending messages too quickly. Please wait a moment." },
});
