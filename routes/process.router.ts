import { Router, Request, Response } from "express";
import { logger } from "../config/logger.js";
import { limit, processFile } from "../lib/process.js";

export const processRouter = Router();

processRouter.post("/", async (req: Request, res: Response) => {
    const { fileKeys = [] } = req.body;

    if (!fileKeys.length) {
        res.status(400).json({ error: "No file keys provided." })
        return;
    }

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

        await Promise.all(
            fileKeys.map((key: string) => limit(async () => {
                sendEvent("status", {
                    status: "processing",
                    message: `Embedding ${key.split("/").pop()}...`
                });
                await processFile(key);
            }))
        );

        const totalMs = (performance.now() - processingStart).toFixed(0);
        logger.info({ fileCount: fileKeys.length, totalMs: Number(totalMs) }, "All files processed");

        sendEvent("status", {
            status: "ready",
            message: "All files ready",
            totalMs
        });

        res.end();
    } catch (error) {
        logger.error({ error }, "File processing failed");
        sendEvent("error", {
            status: "error",
            message: "Failed to process one or more files"
        });
        res.end();
    }
})