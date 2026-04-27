import { Router, Request, Response } from "express";
import { runToolAgent } from "../tools.js";
import { getChatHistory, getChatSummary, unloadModel, updateMemory } from "../lib/utils.js";
import { logger } from "../config/logger.js";
import { limit, processFile } from "../lib/process.js";

export const chatRouter = Router();

chatRouter.post("/", async (req: Request, res: Response) => {
    const { query, sessionId = "default", fileKeys = [] } = req.body;
    const userId = req.sessionId;

    const files = Array.isArray(fileKeys) ? fileKeys : (fileKeys ? [fileKeys] : []);

    console.log("CHAT ROUTER[FILE KEYS]: ", fileKeys);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await unloadModel("nomic-embed-text");

    const [conversationSummary, conversationMessages] = await Promise.all([
        getChatSummary(sessionId),
        getChatHistory(sessionId)
    ]);

    const history = {
        messages: conversationMessages.messages,
        summary: conversationSummary
    };

    if (!query) {
        res.status(400).json({ error: "Query required" });
        return;
    }

    try {
        logger.info({ fileCount: files.length }, "Calling runToolAgent");
        const stream = runToolAgent(query, history, sessionId, files);
        let result = "";

        for await (const chunk of stream) {
            res.write(chunk)
            result += (chunk as string)
        }

        const fileNames = files.map((f: any) => f.name);
        updateMemory(history, query, result, fileNames, sessionId, userId);

        res.end()
    } catch (error) {
        console.error("Streaming Error:", error);

        if (!res.headersSent) {
            res.status(500).send("Internal Server Error");
        } else {
            res.write("\n\n[System: An error occurred while generating the response.]");
            res.end();
        }
    }
})