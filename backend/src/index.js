import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import db from './utils/db.js';
import authRoutes from './routes/user.routes.js'

dotenv.config()



const app = express();

const port= process.env.PORT || 8080;


app.use(cors({
    origin: ['http://localhost:5173'] ,
    credentials: true,               
     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
       allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
    optionsSuccessStatus: 200,
}));



app.use(cookieParser())
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/v1/auth",authRoutes );





db();


app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`)
})

app.get("/api/v1/healthcheck",(req,res)=>{
    res.send("Server is running")
})