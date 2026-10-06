import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import Source from "../../shared/models/source.model.js";
import Chunk from "../../shared/models/chunk.model.js";
import Chat from "../../shared/models/chat.model.js";
import { s3 } from "../../shared/libs/s3.js";
import { deleteSourceVectors } from "../../shared/libs/qdrant.js";

/**
 * Background cascade for deleting a source.
 *
 * Order matters for correctness, not just cleanup:
 *   1. Pull the source out of EVERY chat that referenced it, then flag any chat left with
 *      zero sources as read-only (so the UI can disable it instead of 404-ing on retrieval).
 *   2. Delete Qdrant vectors, Mongo chunks, and the S3 object (best-effort — a single
 *      failing dependency shouldn't strand the rest).
 *   3. Finally delete the Source document itself (authoritative). If this throws, BullMQ
 *      retries the whole job; every step above is idempotent, so retries are safe.
 */
export async function processSourceDeletion(job) {
  const { sourceId, userId, s3Key } = job.data;

  // 1. Remove from all chats, then mark emptied chats read-only.
  await Chat.updateMany(
    { userId, sourceIds: sourceId },
    { $pull: { sourceIds: sourceId } }
  );
  await Chat.updateMany(
    { userId, sourceIds: { $size: 0 }, isReadOnly: false },
    { $set: { isReadOnly: true } }
  );

  // 2. External resources (best-effort).
  try {
    await deleteSourceVectors(userId, sourceId);
  } catch (e) {
    console.warn(`⚠️ Qdrant vector delete failed for source ${sourceId}:`, e.message);
  }
  try {
    await Chunk.deleteMany({ sourceId, userId });
  } catch (e) {
    console.warn(`⚠️ Chunk delete failed for source ${sourceId}:`, e.message);
  }
  if (s3Key) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: s3Key }));
    } catch (e) {
      console.warn(`⚠️ S3 delete failed for source ${sourceId}:`, e.message);
    }
  }

  // 3. Authoritative delete of the source document.
  await Source.deleteOne({ _id: sourceId, userId });
}
