/**
 * One-time migration script: Converts Chat documents from single sourceId to sourceIds[].
 *
 * Before: { sourceId: ObjectId("abc") }
 * After:  { sourceIds: [ObjectId("abc")], title: null }
 *
 * Usage: node scripts/migrate-chat-sourceId.js
 *
 * Safe to run multiple times — only touches documents that still have the old `sourceId` field.
 */

import "../shared/libs/env.js";
import mongoose from "mongoose";
import db from "../shared/libs/db.js";

async function migrate() {
  // Connect to MongoDB
  await db();

  const chatCollection = mongoose.connection.collection("chats");

  // Find all documents that have the old sourceId field
  const docsToMigrate = await chatCollection.countDocuments({
    sourceId: { $exists: true },
  });

  console.log(`📋 Found ${docsToMigrate} chat documents to migrate.`);

  if (docsToMigrate === 0) {
    console.log("✅ No documents need migration. Exiting.");
    process.exit(0);
  }

  // Migrate: wrap sourceId in an array as sourceIds, add title field, remove old sourceId
  const result = await chatCollection.updateMany(
    { sourceId: { $exists: true } },
    [
      {
        $set: {
          sourceIds: ["$sourceId"],
          title: null,
        },
      },
      {
        $unset: "sourceId",
      },
    ]
  );

  console.log(`✅ Migrated ${result.modifiedCount} chat documents.`);
  console.log("   sourceId → sourceIds[] (wrapped in array)");
  console.log("   Added title: null");

  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
