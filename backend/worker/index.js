import { Worker } from "bullmq";
import { processSource } from "./processors/sourceProcessor.js";
import db from "../shared/libs/db.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

// Connect to MongoDB
db();

const worker = new Worker(
  "process-source",
  async (job) => {
    console.log(`Processing job ${job.id}: ${job.data.type}`);
    await processSource(job);
  },
  {
    connection: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
    concurrency: 2, // Process 2 jobs at a time
    limiter: {
      max: 5,
      duration: 60000, // Max 5 jobs per minute (to respect OpenAI rate limits)
    },
  },
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});
