import "./env.js";
import mongoose from "mongoose";

const db = (options = {}) => {
  return mongoose
    .connect(process.env.MONGODB_URI, {
      maxPoolSize: options.maxPoolSize || 20,
      minPoolSize: options.minPoolSize || 5,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 5000,
      ...options,
    })
    .then(() => {
      console.log("Connected to MongoDB");
    })
    .catch((error) => {
      console.log("Error connecting to MongoDB", error);
    });
};

export default db;
