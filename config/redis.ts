import { Redis } from "ioredis";
import { logger } from "./logger.js";

const redis = new Redis({
    host: "localhost",
    port: 6379,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redis.on("connect", () => {
    logger.info("Successfully connected to Redis")
})

redis.on("error", (error) => {
    logger.error({ error }, `Error in Redis connection`)
})

export const redisPing = async () => {
    try {
        await redis.ping();
        logger.info("Redis Ping successful");
    } catch (err) {
        logger.error("Could not connect to Redis on startup");
        process.exit(1);
    }
}

export default redis