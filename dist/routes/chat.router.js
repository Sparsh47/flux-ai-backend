import { Router } from "express";
import { runToolAgent } from "../tools.js";
import { getChatHistory, getChatSummary, updateMemory } from "../utils.js";
import { PDFParse } from "pdf-parse";
import fs from "fs";
import { buildEmbeddings } from "../buildEmbeddings.js";
import { logger } from "../config/logger.js";
import { getFileStream } from "../config/s3.js";
export const chatRouter = Router();
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
chatRouter.post("/", async (req, res) => {
    const { query, sessionId = "default", fileKeys = [] } = req.body;
    const userId = req.sessionId;
    const files = Array.isArray(fileKeys) ? fileKeys : (fileKeys ? [fileKeys] : []);
    const file = files.length > 0 ? files[0] : null;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (files.length > 0) {
        for (const file of files) {
            if (!file.key)
                continue;
            try {
                const stream = await getFileStream(file.bucket || "flux-ai-bucket", file.key);
                const fileBuffer = await streamToBuffer(stream);
                const parser = new PDFParse({ data: fileBuffer });
                const data = await parser.getText();
                const text = data.text;
                logger.info({ filename: file.name, key: file.key }, "Parsed PDF content from S3");
                if (!fs.existsSync("uploads")) {
                    fs.mkdirSync("uploads");
                }
                const safeKey = file.key.replace(/[\/\\]/g, '_');
                const localFilePath = `uploads/${safeKey}.txt`;
                if (!fs.existsSync(localFilePath)) {
                    fs.writeFileSync(localFilePath, text, "utf8");
                    logger.debug(`Saved local file: ${localFilePath}`);
                    await buildEmbeddings(localFilePath, file.key);
                }
                else {
                    logger.debug(`File ${localFilePath} already processed, skipping embedding build.`);
                }
            }
            catch (err) {
                logger.error({ err, file }, "Failed to process file from S3");
            }
        }
    }
    const [conversationSummary, conversationMessages] = await Promise.all([
        getChatSummary(sessionId),
        getChatHistory(sessionId)
    ]);
    const history = {
        messages: conversationMessages.messages,
        summary: conversationSummary
    };
    console.log("HISTORY: ", history);
    if (!query) {
        res.status(400).json({ error: "Query required" });
        return;
    }
    try {
        logger.info({ fileCount: files.length }, "Calling runToolAgent");
        const stream = runToolAgent(query, history, sessionId, files);
        let result = "";
        for await (const chunk of stream) {
            res.write(chunk);
            result += chunk;
        }
        const fileNames = files.map((f) => f.name);
        updateMemory(history, query, result, fileNames, sessionId, userId);
        res.end();
    }
    catch (error) {
        console.error("Streaming Error:", error);
        if (!res.headersSent) {
            res.status(500).send("Internal Server Error");
        }
        else {
            res.write("\n\n[System: An error occurred while generating the response.]");
            res.end();
        }
    }
});
