import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Explicitly load backend/.env regardless of current working directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config(); // fallback

/**
 * Validate configuration at startup ("fail fast").
 *
 * Why: a missing MONGODB_URI or JWTSECRET_KEY should stop the process immediately
 * with a readable message — not surface later as a confusing runtime error in the
 * middle of a user request. Critical vars throw; recommended-but-optional vars
 * only warn so a partially-configured dev environment can still boot.
 */
const criticalSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWTSECRET_KEY: z.string().min(1, "JWTSECRET_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
});

const recommendedVars = [
  "QUADRANT_URL",
  "QUADRANT_API_KEY",
  "S3_API",
  "S3_Access_Key_ID",
  "S3_Secret_Access_Key",
  "S3_BUCKET",
  "REDIS_HOST",
];

// Guard so this runs only once even though env.js is imported from many modules.
if (!globalThis.__envValidated) {
  globalThis.__envValidated = true;

  const result = criticalSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.message}`).join("\n");
    console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
    // Exit rather than limp along in a broken state.
    process.exit(1);
  }

  const missingRecommended = recommendedVars.filter((v) => !process.env[v]);
  if (missingRecommended.length) {
    console.warn(
      `⚠️  Missing recommended env vars (some features may not work): ${missingRecommended.join(", ")}`
    );
  }
}
