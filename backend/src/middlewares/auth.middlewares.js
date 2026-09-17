import jwt from "jsonwebtoken";
import User from "../../shared/models/user.model.js";
import dotenv from "dotenv";
dotenv.config();
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
      return res.status(400).json({
        success: false,

        message: "No Token Found",
      });
    }

    const decoded = jwt.verify(token, process.env.JWTSECRET_KEY);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User Not Found via token",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.log(error);
    res.status(400).json({
      success: false,
      message: "Error while authentic token",
    });
  }
};

export const ADMIN_EMAIL = "yashovardhans321@chithilm.com";

/**
 * Middleware restricting access exclusively to the designated admin email.
 */
export const isAdmin = (req, res, next) => {
  if (!req.user || req.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Access restricted to admin (yashovardhans321@chithilm.com)",
    });
  }
  next();
};
