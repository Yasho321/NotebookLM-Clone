import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config()


const db = () =>{
    
    
    
    mongoose.connect(process.env.MONGODB_URI).then(()=>{
        console.log("Connected to MongoDB");
    }).catch((error)=>{
        console.log("Error connecting to MongoDB",error);
    })
}

export default db;