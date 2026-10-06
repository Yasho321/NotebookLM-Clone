import { ValidationError } from "../../shared/libs/errors.js";

/**
 * Returns middleware that validates part of the request against a zod schema.
 *
 * It validates but does NOT replace req.body, so existing controllers keep reading
 * the original fields. On failure it throws a 422 with a readable field list.
 *
 * Usage:  router.post("/login", validate(loginSchema), login)
 *         router.post("/x", validate(schema, "params"), handler)
 */
export const validate = (schema, source = "body") => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join(".") || source,
      message: i.message,
    }));
    throw new ValidationError("Validation failed", details);
  }
  next();
};

export default validate;
