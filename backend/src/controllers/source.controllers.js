import "dotenv/config";
import Source from "../../shared/models/source.model.js";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Queue } from "bullmq";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { s3 } from "../../shared/libs/s3.js";

const sourceQueue = new Queue("process-source", {
  connection: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

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
    });

    await sourceQueue.add("process-source", {
      sourceId: source._id.toString(),
      userId: userId.toString(),
      s3Key: source.s3Key,
      type: source.type,
      typeSpecificData: source.textContent,
      mimeType: source.mimeType,
    });

    await Source.findByIdAndUpdate(source._id, {
      status: "queued",
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
    const source = await Source.create({
      userId,
      type: "link",
      webURL: url,
    });
    await sourceQueue.add("process-source", {
      sourceId: source._id.toString(),
      userId: userId.toString(),
      s3Key: source.s3Key,
      type: source.type,
      typeSpecificData: source.webURL,
      mimeType: source.mimeType,
    });
    await Source.findByIdAndUpdate(source._id, {
      status: "queued",
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

export const getSources = async (req, res) => {
  try {
    const userId = req.user._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const sources = await Source.find({
      userId,
    });

    if (!sources) {
      return res.status(400).json({
        success: false,
        message: "Unable to fetch sources",
      });
    }

    const sourcesToReturn = sources.filter((source) => {
      return source.status != "uploading";
    });

    return res.status(200).json({
      success: true,
      message: "Sources fetched successfully",
      sources: sourcesToReturn,
    });
  } catch (error) {
    console.log(error);
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
      return res.status(400).json({ error: "Unsupported file type" });
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

    await sourceQueue.add("process-source", {
      sourceId: source._id.toString(),
      userId: userId.toString(),
      s3Key: source.s3Key,
      type: source.type,
      typeSpecificData: source.textContent,
      mimeType: source.mimeType,
    });

    await Source.findByIdAndUpdate(`${source._id}`, {
      status: "queued",
    });

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
    if (source.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Source is not processed yet",
      });
    }

    const exp = 3600;

    const presignedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: source.s3Key,
      }),
      { expiresIn: exp },
    );

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
