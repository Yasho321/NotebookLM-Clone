/**
 * Typed application errors.
 *
 * Instead of each controller writing `res.status(404).json(...)`, it can simply
 * `throw new NotFoundError("Chat not found")`. The central error middleware reads
 * `.statusCode` and produces a consistent response. `isOperational` distinguishes
 * expected errors (bad input, not found) from unexpected bugs we should log loudly.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true; // expected/handled error, not a programming bug
    if (details) this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details) {
    super(message, 400, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details) {
    super(message, 422, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Already exists") {
    super(message, 409);
  }
}
