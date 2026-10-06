import { AppError } from "../../shared/libs/errors.js";
import { logger } from "../../shared/libs/logger.js";

/** 404 handler for any route that didn't match. Must be registered AFTER all routes. */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Central error handler. Must be the LAST app.use() and take 4 args so Express
 * recognizes it as an error handler.
 *
 * Produces the same { success:false, message } shape the frontend already reads
 * (error.response.data.message), so it is backward-compatible with existing UI.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // Translate a few common library errors into clean statuses.
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details = err.details;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
  } else if (err.name === "ValidationError" && err.errors) {
    // Mongoose validation error
    statusCode = 422;
    details = Object.values(err.errors).map((e) => e.message);
    message = "Validation failed";
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid identifier";
  } else if (err.code === 11000) {
    // Mongo duplicate key
    statusCode = 409;
    message = "This record already exists";
  }

  // Log server errors loudly; log expected 4xx quietly.
  if (statusCode >= 500) {
    logger.error({ err, reqId: req.id, path: req.originalUrl }, "Unhandled server error");
  } else {
    logger.warn({ reqId: req.id, path: req.originalUrl, statusCode, message }, "Request error");
  }

  // Never leak internal error details to clients in production.
  if (statusCode >= 500 && process.env.NODE_ENV === "production") {
    message = "Internal server error";
    details = undefined;
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
};
