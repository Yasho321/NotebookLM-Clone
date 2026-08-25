import "./env.js";
import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: "auto", // Required by AWS SDK, not used by R2
  // Provide your R2 endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  endpoint: process.env.S3_API,
  credentials: {
    // Provide your R2 Access Key ID and Secret Access Key
    accessKeyId: process.env.S3_Access_Key_ID,
    secretAccessKey: process.env.S3_Secret_Access_Key,
  },
});
