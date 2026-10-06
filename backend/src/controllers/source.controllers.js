import "dotenv/config";
import Source from "../../shared/models/source.model.js";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Queue } from "bullmq";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { s3 } from "../../shared/libs/s3.js";
import { getSharedRedisClient } from "../../shared/libs/redis.js";
import { assertSafeUrl } from "../../shared/libs/urlGuard.js";
import { logger } from "../../shared/libs/logger.js";

const sourceQueue = new Queue("process-source", {
  connection: getSharedRedisClient(),
});

// Dedicated queue for the (potentially slow) source-deletion cascade:
// Qdrant vectors + Mongo chunks + S3 object + pulling the source out of every chat.
const deleteSourceQueue = new Queue("delete-source", {
  connection: getSharedRedisClient(),
});

const presignedUrlCache = new Map();

export const text2 = async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Text is required",
      });
    }

    const source = await Source.create({
      userId,
      type: "text-paste",
      textContent: text,
      status: "queued",
    });

    await sourceQueue.add("process-source", {
      sourceId: source._id.toString(),
      userId: userId.toString(),
      s3Key: source.s3Key,
      type: source.type,
      typeSpecificData: source.textContent,
      mimeType: source.mimeType,
    });

    return res.status(200).json({
      success: true,
      source: {
        id: source._id,
        status: source.status,
        textContent: source.textContent,
      },
      message: "Text queued",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while queuing text",
    });
  }
};

export const web2 = async (req, res) => {
  try {
    const { url } = req.body;
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    if (!url) {
      return res.status(400).json({
        success: false,
        message: "URL is required",
      });
    }

    // SSRF guard: reject private/loopback/metadata URLs before we ever queue them.
    try {
      await assertSafeUrl(url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: e.message || "This URL cannot be processed",
      });
    }

    const source = await Source.create({
      userId,
      type: "link",
      webURL: url,
      status: "queued",
    });
    await sourceQueue.add("process-source", {
      sourceId: source._id.toString(),
      userId: userId.toString(),
      s3Key: source.s3Key,
      type: source.type,
      typeSpecificData: source.webURL,
      mimeType: source.mimeType,
    });
    return res.status(200).json({
      success: true,
      source: {
        id: source._id,
        status: source.status,
        webURL: source.webURL,
      },
      message: "URL queued",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while queuing URL",
    });
  }
};

// Cursor helpers: a cursor is an opaque base64 of "<createdAtMs>_<_id>", which together
// give a stable, unique sort key (createdAt can tie; _id breaks ties). This is keyset
// pagination — it stays correct and fast even as new sources are added, unlike offset
// pagination which can skip/duplicate rows when the list shifts.
function encodeCursor(doc) {
  return Buffer.from(`${new Date(doc.createdAt).getTime()}_${doc._id}`).toString("base64");
}
function decodeCursor(cursor) {
  try {
    const [ms, id] = Buffer.from(cursor, "base64").toString("utf8").split("_");
    return { createdAt: new Date(Number(ms)), id };
  } catch {
    return null;
  }
}

export const getSources = async (req, res) => {
  try {
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 50);
    const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;

    // Hide sources that are mid-upload or mid-deletion from the library.
    const filter = { userId, status: { $nin: ["uploading", "deleting"] } };

    // Newest first. The cursor asks for rows strictly "older" than the last one seen.
    if (cursor) {
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    // Fetch one extra to know whether another page exists.
    const docs = await Source.find(filter)
      .select("-textContent")
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;
    const sources = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? encodeCursor(sources[sources.length - 1]) : null;

    return res.status(200).json({
      success: true,
      message: "Sources fetched successfully",
      sources: sources || [],
      nextCursor,
      hasMore,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching sources");
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching sources",
    });
  }
};

export const getPresign = async (req, res) => {
  try {
    const { fileName, fileType, fileSize } = req.body;
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (fileSize > 50 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "File size should be less than 50MB",
      });
    }

    let type;
    if (fileType === "application/pdf") {
      type = "pdf";
    } else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      type = "docx";
    } else if (fileType === "text/plain") {
      type = "text";
    } else if (fileType === "text/csv") {
      type = "csv";
    } else {
      return res.status(400).json({
        success: false,
        message: "Unsupported file type. Use PDF, DOCX, TXT, or CSV.",
      });
    }

    const key = `${uuidv4()}-${fileName}`;
    const source = await Source.create({
      userId,
      originalFileName: fileName,
      s3Key: key,
      mimeType: fileType,
      type,
    });

    const putUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ContentType: fileType,
      }),
      { expiresIn: 3600 },
    );

    return res.status(200).json({
      success: true,
      message: "Pre-signed URL generated successfully",
      presignedUrl: putUrl,
      source: {
        id: source._id,
        key: source.s3Key,
        status: source.status,
        originalFileName: source.originalFileName,
        mimeType: source.mimeType,
        type: source.type,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while generating pre-signed URL",
    });
  }
};

export const confirmUpload = async (req, res) => {
  try {
    const { sourceId } = req.body;
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!sourceId) {
      return res.status(400).json({
        success: false,
        message: "Source ID is required",
      });
    }

    const source = await Source.findById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        message: "Source not found",
      });
    }

    if (source.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    source.status = "queued";
    await Promise.all([
      source.save(),
      sourceQueue.add("process-source", {
        sourceId: source._id.toString(),
        userId: userId.toString(),
        s3Key: source.s3Key,
        type: source.type,
        typeSpecificData: source.textContent,
        mimeType: source.mimeType,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Source queued for processing successfully",
      source: {
        id: source._id,
        status: source.status,
        originalFileName: source.originalFileName,
        mimeType: source.mimeType,
        type: source.type,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while confirming upload",
    });
  }
};

export const getStatus = async (req, res) => {
  try {
    const { sourceId } = req.params;
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!sourceId) {
      return res.status(400).json({
        success: false,
        message: "Source ID is required",
      });
    }

    const source = await Source.findById(sourceId).lean();
    if (!source) {
      return res.status(404).json({
        success: false,
        message: "Source not found",
      });
    }

    if (source.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Source status fetched successfully",
      source: {
        id: source._id,
        status: source.status,
        originalFileName: source.originalFileName,
        mimeType: source.mimeType,
        type: source.type,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching status",
    });
  }
};

export const getViewUrl = async (req, res) => {
  try {
    const { sourceId } = req.params;
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!sourceId) {
      return res.status(400).json({
        success: false,
        message: "Source ID is required",
      });
    }

    const source = await Source.findById(sourceId).lean();
    if (!source) {
      return res.status(404).json({
        success: false,
        message: "Source not found",
      });
    }

    if (source.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }
    if (source.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Source is not processed yet",
      });
    }

    const exp = 3600;
    const now = Date.now();
    const cacheKey = `${userId}:${source.s3Key}`;
    const cached = presignedUrlCache.get(cacheKey);
    let presignedUrl;

    if (cached && cached.expiresAt > now + 300 * 1000) {
      presignedUrl = cached.url;
    } else {
      presignedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: source.s3Key,
        }),
        { expiresIn: exp },
      );

      if (presignedUrlCache.size > 500) {
        const oldestKey = presignedUrlCache.keys().next().value;
        presignedUrlCache.delete(oldestKey);
      }

      presignedUrlCache.set(cacheKey, {
        url: presignedUrl,
        expiresAt: now + exp * 1000,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Source view URL fetched successfully",
      viewUrl: presignedUrl,
      expiresIn: exp,
      source: {
        id: source._id,
        status: source.status,
        originalFileName: source.originalFileName,
        mimeType: source.mimeType,
        type: source.type,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching view URL",
    });
  }
};

/**
 * Delete a source. The heavy cascade (Qdrant vectors, Mongo chunks, S3 object, and
 * pulling this source out of every chat) runs in a background BullMQ job so the request
 * returns instantly and a slow external service can't make the user wait.
 *
 * We mark the source "deleting" immediately so it disappears from the library (getSources
 * filters it out) even before the job finishes. Allowed at any time — including when a
 * chat is "locked" — because the cascade handles chat membership correctly.
 */
export const deleteSource = async (req, res) => {
  try {
    const { sourceId } = req.params;
    const userId = req.user._id;

    const source = await Source.findById(sourceId);
    if (!source) {
      return res.status(404).json({ success: false, message: "Source not found" });
    }
    if (source.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this source" });
    }

    // Mark as deleting (hidden from the library) and enqueue the cascade atomically.
    source.status = "deleting";
    await Promise.all([
      source.save(),
      deleteSourceQueue.add("delete-source", {
        sourceId: source._id.toString(),
        userId: userId.toString(),
        s3Key: source.s3Key,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Source deletion started",
      sourceId,
    });
  } catch (error) {
    logger.error({ err: error }, "Error starting source deletion");
    return res.status(500).json({
      success: false,
      message: "Internal server error while deleting source",
    });
  }
};

/**
 * Rename a source (its display title). Owner-only.
 */
export const renameSource = async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { title } = req.body;
    const userId = req.user._id;

    const source = await Source.findById(sourceId);
    if (!source) {
      return res.status(404).json({ success: false, message: "Source not found" });
    }
    if (source.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to rename this source" });
    }

    const newTitle = title.trim();
    await Source.updateOne({ _id: sourceId, userId }, { $set: { title: newTitle } });

    return res.status(200).json({
      success: true,
      message: "Source renamed",
      source: { id: sourceId, title: newTitle },
    });
  } catch (error) {
    logger.error({ err: error }, "Error renaming source");
    return res.status(500).json({
      success: false,
      message: "Internal server error while renaming source",
    });
  }
};
