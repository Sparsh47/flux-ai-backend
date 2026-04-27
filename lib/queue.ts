import { Queue } from "bullmq";
import { logger } from "../config/logger.js";

export const connection = {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379
}

export const fileProcessingQueue = new Queue("file-processing", {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500
    }
})

logger.info("File processing queue initialized")