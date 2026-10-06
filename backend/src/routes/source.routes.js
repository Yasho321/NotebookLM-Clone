import { Router } from "express";
import { isLoggedIn } from "../middlewares/auth.middlewares.js";
import { validate } from "../middlewares/validate.middlewares.js";
import {
  textSchema,
  webSchema,
  presignSchema,
  confirmUploadSchema,
  renameSourceSchema,
} from "../validators/source.validators.js";
import {
  confirmUpload,
  deleteSource,
  renameSource,
  getPresign,
  getSources,
  getStatus,
  getViewUrl,
  text2,
  web2,
} from "../controllers/source.controllers.js";

const router = Router();

router.post("/text", isLoggedIn, validate(textSchema), text2);
router.post("/presign", isLoggedIn, validate(presignSchema), getPresign);
router.post("/confirm-upload", isLoggedIn, validate(confirmUploadSchema), confirmUpload);
router.post("/web", isLoggedIn, validate(webSchema), web2);
router.get("/", isLoggedIn, getSources);
router.get("/:sourceId/status", isLoggedIn, getStatus);
router.get("/:sourceId/view-url", isLoggedIn, getViewUrl);
router.patch("/:sourceId", isLoggedIn, validate(renameSourceSchema), renameSource);
router.delete("/:sourceId", isLoggedIn, deleteSource);

export default router;
