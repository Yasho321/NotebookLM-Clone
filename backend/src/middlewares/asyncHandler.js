/**
 * Wraps an async route handler so any thrown error (or rejected promise) is forwarded
 * to Express's error middleware via next(err). Without this, an async throw becomes an
 * unhandled rejection and the request hangs.
 *
 * Usage:  router.get("/", asyncHandler(async (req, res) => { ... throw new NotFoundError() }))
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
