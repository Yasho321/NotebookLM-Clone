import jwt from "jsonwebtoken";
import User from "../../shared/models/user.model.js";
import "../../shared/libs/env.js";

export const isLoggedIn = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.token) {
      // Fallback to cookie for same-origin requests
      token = req.cookies.token;
    }

    if (!token) {
      // 401 (not 400): the request is well-formed, it just lacks valid credentials.
      // The frontend's axios interceptor keys off 401 to redirect to login.
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWTSECRET_KEY);

    // A refresh token must never be accepted as an access token.
    if (decoded.type === "refresh") {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Session is no longer valid",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    // jwt.verify throws on expired/invalid tokens — that is a 401, not a 500/400.
    console.error("Auth error:", error.message);
    res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
  }
};

// Bootstrap admin by email via env (optional), e.g. ADMIN_EMAIL="you@example.com".
// Long-term, admin status lives on the user's `role` field in the database.
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

/**
 * Middleware restricting access to admins.
 * A user is admin if their `role` is "admin" OR their email matches ADMIN_EMAIL.
 */
export const isAdmin = (req, res, next) => {
  const isRoleAdmin = req.user?.role === "admin";
  const isEmailAdmin =
    ADMIN_EMAIL && req.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (!req.user || (!isRoleAdmin && !isEmailAdmin)) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: admin access required",
    });
  }
  next();
};
