import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Rate limiting protects against abuse and runaway cost.
 *
 * - Every chat message hits OpenAI, which costs real money. One script could drain
 *   your budget overnight without a limit.
 * - Login/register are brute-force targets, so they get a tighter limit.
 *
 * `standardHeaders` sends RateLimit-* headers so clients can see their remaining quota.
 * Limits are keyed by IP by default; once you have auth you can key by user id instead.
 */

// Generous catch-all for normal API traffic.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // ~40 req/min sustained
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please slow down." },
});

// Tight limit for credential endpoints to blunt brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count toward the limit
  message: { success: false, message: "Too many attempts, please try again later." },
});

// Per-user limit for the expensive LLM endpoints (keyed by authenticated user id).
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Key by authenticated user id; fall back to IP via the ipKeyGenerator helper, which
  // normalizes IPv6 (groups by /64) so IPv6 clients can't dodge the limit.
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req.ip),
  message: { success: false, message: "You're sending messages too quickly. Please wait a moment." },
});
