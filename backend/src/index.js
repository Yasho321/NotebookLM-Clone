import "../shared/libs/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import db from "../shared/libs/db.js";
import authRoutes from "./routes/user.routes.js";
import sourceRouter from "./routes/source.routes.js";
import chatRouter from "./routes/chat.routes.js";
import observabilityRouter from "./routes/observability.routes.js";
import { initNeo4jConstraints } from "../shared/libs/neo4j.js";
import { initQdrantIndexes } from "../shared/libs/qdrant.js";
import { apiLimiter } from "./middlewares/rateLimit.middlewares.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middlewares.js";
import { logger } from "../shared/libs/logger.js";
import pinoHttp from "pino-http";
import mongoose from "mongoose";

const app = express();

const port = process.env.PORT || 8080;

// We run behind a reverse proxy (Caddy/nginx). Trusting the first proxy hop lets
// express-rate-limit read the real client IP from X-Forwarded-For instead of the proxy's.
app.set("trust proxy", 1);

// Security headers (clickjacking, MIME sniffing, etc.). crossOriginResourcePolicy is
// relaxed because the frontend is served from a different origin than this API.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(
  compression({
    level: 1,
    threshold: 1024,
    filter: (req, res) => {
      // Never compress SSE streams or streaming message endpoints to ensure instant token delivery
      if (
        req.path?.includes("/message") ||
        req.path?.includes("/regenerate") ||
        req.headers.accept?.includes("text/event-stream") ||
        res.getHeader("content-type")?.includes("text/event-stream")
      ) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://notebook-lm-clone-one.vercel.app",
      "https://chithhilm.yasho.tech",
      "https://chithhi-lm.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
    optionsSuccessStatus: 200,
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Structured per-request logging with an auto-generated request id (req.id).
// Skip the noisy healthcheck so uptime pings don't flood the logs.
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url?.includes("/healthcheck") },
  })
);

// Catch-all rate limit for the whole API (per-route stricter limits are applied inside routers).
app.use("/api", apiLimiter);

// Liveness: cheap, for uptime pings.
app.get("/api/v1/healthcheck", (req, res) => {
  res.send("Server is running");
});

// Readiness: reports whether critical dependencies are actually reachable.
app.get("/api/v1/health", async (req, res) => {
  const mongoUp = mongoose.connection.readyState === 1; // 1 = connected
  res.status(mongoUp ? 200 : 503).json({
    success: mongoUp,
    status: mongoUp ? "ok" : "degraded",
    services: { mongo: mongoUp ? "up" : "down" },
    uptime: process.uptime(),
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/source", sourceRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/observability", observabilityRouter);

// 404 for unmatched routes, then the central error handler (must be last).
app.use(notFoundHandler);
app.use(errorHandler);

// Start listening only after MongoDB connects, so we never accept traffic in a broken state.
db()
  ?.then(() => {
    initNeo4jConstraints().catch((e) => console.warn("Neo4j init error:", e.message));
    initQdrantIndexes().catch((e) => console.warn("Qdrant init error:", e.message));
    app.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
    });
  })
  .catch((e) => {
    logger.fatal({ err: e }, "Could not connect to MongoDB");
    process.exit(1);
  });
