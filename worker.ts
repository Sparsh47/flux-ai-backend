import { Worker, Job } from "bullmq";
import { logger } from "./config/logger.js";
import { connection } from "./lib/queue.js";
import { processFile } from "./lib/process.js";

interface FileProcessingJob {
    fileKey: string;
    sessionId: string;
}

const worker = new Worker<FileProcessingJob>("file-processing", async (job: Job<FileProcessingJob>) => {
    const { fileKey } = job.data;

    logger.info({ jobId: job.id, fileKey }, "Processing job started");

    try {
        await job.updateProgress(10);
        const results = await processFile(fileKey);
        await job.updateProgress(100);

        logger.info({ jobId: job.id, fileKey }, "Processing job completed successfully");

        return { ...results, status: "ready" }
    } catch (error) {
        logger.error({ jobId: job.id, fileKey, error }, "Processing job failed");
        throw error
    }
},
    {
        connection,
        concurrency: 2
    })

worker.on("completed", (job: Job<FileProcessingJob>, result) => {
    logger.info({ jobId: job.id, fileKey: job.data.fileKey }, "Job completed successfully");
})

worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Job failed")
})

worker.on("error", (err) => {
    logger.error({ err }, "Worker error")
})

logger.info("Worker started, waiting for jobs...")