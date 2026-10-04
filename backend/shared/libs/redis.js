import "./env.js";
import Redis from "ioredis";

export const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  maxRetriesPerRequest: null,
};

let sharedRedisClient = null;

export const getSharedRedisClient = () => {
  if (!sharedRedisClient) {
    sharedRedisClient = new Redis(redisConfig);
    sharedRedisClient.on("error", (err) => {
      console.error("Redis connection error:", err.message);
    });
  }
  return sharedRedisClient;
};

export default getSharedRedisClient;
