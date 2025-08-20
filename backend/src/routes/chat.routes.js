import {Router } from 'express';
import { isLoggedIn } from '../middlewares/auth.middlewares.js';
import { createMessage, getChats } from '../controllers/chat.controllers.js';



const router = Router();

router.post("/:sourceId", isLoggedIn , createMessage);

router.get("/:sourceId", isLoggedIn , getChats)







export default router;