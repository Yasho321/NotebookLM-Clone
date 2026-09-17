import "../shared/libs/env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import db from "../shared/libs/db.js";
import authRoutes from "./routes/user.routes.js";
import sourceRouter from "./routes/source.routes.js";
import chatRouter from "./routes/chat.routes.js";
import observabilityRouter from "./routes/observability.routes.js";

const app = express();

const port = process.env.PORT || 8080;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://notebook-lm-clone-one.vercel.app",
      "https://chithhilm.yasho.tech",
      "https://chithhi-lm.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
    optionsSuccessStatus: 200,
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/source", sourceRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/observability", observabilityRouter);

db();

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.get("/api/v1/healthcheck", (req, res) => {
  res.send("Server is running");
});
