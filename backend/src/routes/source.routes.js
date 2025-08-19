import {Router } from 'express';
import { isLoggedIn } from '../middlewares/auth.middlewares.js';
import { text, upload, web } from '../controllers/source.controllers.js';


const router = Router();

router.post("/text", isLoggedIn , text)
router.post("/upload", isLoggedIn,  upload)
router.get("/web", isLoggedIn, web)





export default router;