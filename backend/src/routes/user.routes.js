import {Router } from 'express';
import { isLoggedIn } from '../middlewares/auth.middlewares.js';
import {getMe, login, logout, register } from '../controllers/user.controllers.js';

const router = Router();

router.post("/register",  register)
router.post("/login",  login)
router.get("/logout", isLoggedIn, logout)

router.get("/me" , isLoggedIn, getMe)



export default router;