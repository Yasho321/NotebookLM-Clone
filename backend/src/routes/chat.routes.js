import {Router } from 'express';
import { isLoggedIn } from '../middlewares/auth.middlewares.js';
import { createMessage } from '../controllers/chat.controllers.js';



const router = Router();

router.post("/:sourceId", isLoggedIn , createMessage);







export default router;