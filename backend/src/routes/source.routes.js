import {Router } from 'express';
import { isLoggedIn } from '../middlewares/auth.middlewares.js';
import { text,  uploadFile, web } from '../controllers/source.controllers.js';
import multer from "multer";
import path from "path";
import fs from "fs";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });


const router = Router();

router.post("/text", isLoggedIn , text)
router.post("/upload", isLoggedIn, upload.single("file"),  uploadFile)
router.get("/web", isLoggedIn, web)





export default router;