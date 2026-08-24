import { Router } from "express";
import { isLoggedIn } from "../middlewares/auth.middlewares.js";
import {
  confirmUpload,
  getPresign,
  getSources,
  getStatus,
  getViewUrl,
  text2,
  web2,
} from "../controllers/source.controllers.js";

const router = Router();

router.post("/text", isLoggedIn, text2);
router.post("/presign", isLoggedIn, getPresign);
router.post("/confirm-upload", isLoggedIn, confirmUpload);
router.post("/web", isLoggedIn, web2);
router.get("/", isLoggedIn, getSources);
router.get("/:sourceId/status", isLoggedIn, getStatus);
router.get("/:sourceId/view-url", isLoggedIn, getViewUrl);

export default router;
