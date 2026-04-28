import { Worker, Job } from "bullmq";
import { logger } from "./config/logger.js";
import { connection } from "./lib/queue.js";
import { processFile } from "./lib/process.js";
import Sentry from "./config/sentry.js";

interface FileProcessingJob {
    fileKey: string;
    sessionId: string;
}

const worker = new Worker<FileProcessingJob>("file-processing", async (job: Job<FileProcessingJob>) => {
    const transaction = Sentry.startInactiveSpan({
        name: "file-processing-job",
        op: "bullmq.job",
        attributes: {
            jobId: job.id,
            fileKey: job.data.fileKey,
        }
    })

    const { fileKey } = job.data;

    logger.info({ jobId: job.id, fileKey }, "Processing job started");

    try {
        await job.updateProgress(10);
        const results = await processFile(fileKey);
        await job.updateProgress(100);

        logger.info({ jobId: job.id, fileKey }, "Processing job completed successfully");

        transaction.setStatus({ code: 1, message: "ok" })
        transaction.end()
        return { ...results, status: "ready" }
    } catch (error) {
        transaction.setStatus({ code: 2, message: "error" })
        transaction.end()
        logger.error({ jobId: job.id, fileKey, error }, "Processing job failed");
        Sentry.captureException(error, {
            extra: {
                jobId: job.id,
                fileKey: job.data.fileKey,
                attemptsMade: job.attemptsMade
            }
        })
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
    Sentry.captureException(err, {
        extra: {
            jobId: job?.id,
            fileKey: job?.data.fileKey,
            attemptsMade: job?.attemptsMade
        }
    })
    logger.error({ jobId: job?.id, err }, "Job failed")
})

worker.on("error", (err) => {
    logger.error({ err }, "Worker error")
})

logger.info("Worker started, waiting for jobs...")