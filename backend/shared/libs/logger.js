import pino from "pino";

/**
 * Structured logger.
 *
 * Why structured logs: `console.log("x", obj)` produces unsearchable text. pino emits
 * JSON lines ({"level":"error","msg":...,"reqId":...}) that log platforms can filter and
 * alert on. In development we pretty-print; in production we emit raw JSON.
 *
 * Migrate gradually: new code should use this logger; existing console.* calls can be
 * replaced over time.
 */
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
  // Never log secrets even if they appear on an object we pass in.
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
});

export default logger;
