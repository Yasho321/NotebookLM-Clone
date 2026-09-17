import "../shared/libs/env.js";
import { Worker } from "bullmq";
import { processSource } from "./processors/sourceProcessor.js";
import { processChatSummary } from "./processors/chatSummaryProcessor.js";
import { processMemoryExtraction } from "./processors/memoryProcessor.js";
import { processTraceLogging } from "./processors/traceProcessor.js";
import db from "../shared/libs/db.js";

// Connect to MongoDB
db();

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
};

// 1. Source ingestion worker
const sourceWorker = new Worker(
  "process-source",
  async (job) => {
    console.log(`Processing source job ${job.id}: ${job.data.type}`);
    await processSource(job);
  },
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 60000,
    },
  }
);

sourceWorker.on("completed", (job) => {
  console.log(`✅ Source job ${job.id} completed`);
});

sourceWorker.on("failed", (job, err) => {
  console.error(`❌ Source job ${job.id} failed:`, err.message);
});

// 2. Chat Context Pruning & Rolling Summarization worker (after every 30 messages)
const chatSummaryWorker = new Worker(
  "chat-summary",
  async (job) => {
    console.log(`Processing chat summary job ${job.id} for chat ${job.data.chatId}`);
    await processChatSummary(job);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

chatSummaryWorker.on("completed", (job) => {
  console.log(`✅ Chat summary job ${job.id} completed`);
});

chatSummaryWorker.on("failed", (job, err) => {
  console.error(`❌ Chat summary job ${job.id} failed:`, err.message);
});

// 3. Long-Term Memory Extraction worker (after every 40 messages)
const memoryWorker = new Worker(
  "memory-extraction",
  async (job) => {
    console.log(`Processing memory extraction job ${job.id} for user ${job.data.userId}`);
    await processMemoryExtraction(job);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

memoryWorker.on("completed", (job) => {
  console.log(`✅ Memory extraction job ${job.id} completed`);
});

memoryWorker.on("failed", (job, err) => {
  console.error(`❌ Memory extraction job ${job.id} failed:`, err.message);
});

// 4. Asynchronous Trace Logging worker (persists telemetry without blocking API)
const traceWorker = new Worker(
  "trace-logging",
  async (job) => {
    await processTraceLogging(job);
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

traceWorker.on("failed", (job, err) => {
  console.error(`❌ Trace logging job ${job.id} failed:`, err.message);
});
