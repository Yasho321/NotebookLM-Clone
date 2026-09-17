import TraceLog from "../../shared/models/traceLog.model.js";

/**
 * BullMQ Worker processor for asynchronous trace persistence.
 * Takes serialized trace payloads from the API server and writes them to MongoDB.
 *
 * @param {import("bullmq").Job} job
 */
export async function processTraceLogging(job) {
  const traceData = job.data;
  if (!traceData || !traceData.traceId) {
    throw new Error("Invalid trace job payload: missing traceId");
  }

  await TraceLog.findOneAndUpdate(
    { traceId: traceData.traceId },
    { $set: traceData },
    { upsert: true, new: true }
  );
}
