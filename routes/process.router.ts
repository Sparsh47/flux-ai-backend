import { Router, Request, Response } from "express";
import { logger } from "../config/logger.js";
import { limit, processFile } from "../lib/process.js";
import { fileProcessingQueue } from "../lib/queue.js";
import { Queue } from "bullmq";

export const processRouter = Router();

processRouter.post("/", async (req: Request, res: Response) => {
    const { fileKeys = [], sessionId: bodySessionId } = req.body;
    // Prefer the body sessionId (the frontend's chat session) with cookie as fallback
    const sessionId = bodySessionId || req.sessionId;

    if (!fileKeys.length) {
        res.status(400).json({ error: "No file keys provided." })
        return;
    }

    logger.info({ sessionId, fileCount: fileKeys.length }, "PROCESS ROUTER: ingesting files with userId=sessionId");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (event: string, data: Object) => {
        res.write(`event: ${event}\n data: ${JSON.stringify(data)}\n\n`);
    }

    try {
        sendEvent("status", {
            status: "processing",
            message: `Processing ${fileKeys.length} file(s)`
        });

        const processingStart = performance.now();

        const queueStart = performance.now();
        const jobs = await Promise.all(
            fileKeys.map((key: string) => fileProcessingQueue.add("process-file", { fileKey: key, sessionId, userId: sessionId }))
        );
        const queueTimeMs = performance.now() - queueStart;

        sendEvent("status", {
            status: "processing",
            message: `Queued ${fileKeys.length} file(s) for processing`,
            queueTimeMs: queueTimeMs.toFixed(0)
        })

        const jobResults = await pollJobsUntilDone(jobs, sendEvent)

        const totalMs = (performance.now() - processingStart).toFixed(0);
        logger.info({ fileCount: fileKeys.length, totalMs: Number(totalMs) }, "All files processed");

        sendEvent("status", {
            status: "ready",
            message: "All files ready",
            totalMs,
            queueTimeMs: queueTimeMs.toFixed(0),
            fileResults: jobResults
        });

        res.end();
    } catch (error: any) {
        logger.error({ err: error, message: error.message }, "Failed to queue files")
        sendEvent("error", {
            status: "error",
            message: error.message || "Failed to process files"
        })
        res.end()
    }
})

async function pollJobsUntilDone(jobs: any[], sendEvent: Function) {
    const POLL_INTERVAL = 100;

    while (true) {
        const states = await Promise.all(jobs.map(job => job.getState()));

        const completed = states.filter(state => state === "completed").length;
        const failed = states.filter(state => state === "failed").length;
        const total = jobs.length;

        sendEvent("status", {
            status: "processing",
            message: `${completed}/${total} files processed`
        })

        if (completed + failed === total) {
            if (failed > 0) {
                throw new Error(`${failed} file(s) failed to process`);
            }
            // Return the return values of all jobs
            return await Promise.all(jobs.map(job => job.returnvalue));
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
    }
}