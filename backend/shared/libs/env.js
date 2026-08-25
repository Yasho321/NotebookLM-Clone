import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Explicitly load backend/.env regardless of current working directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config(); // fallback
