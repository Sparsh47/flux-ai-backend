import { Router } from "express";
import { sessions } from "../server.js";
import { runToolAgent } from "../tools.js";
import { updateMemory } from "../utils.js";
import { PDFParse } from "pdf-parse";
import fs from "fs";
import { buildEmbeddings } from "../buildEmbeddings.js";
import { logger } from "../config/logger.js";
export const chatRouter = Router();
chatRouter.post("/", async (req, res) => {
    const { query, sessionId = "default" } = req.body;
    const userId = req.sessionId;
    const files = req.files || [];
    const file = files.length > 0 ? files[0] : null;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (!sessions[sessionId]) {
        sessions[sessionId] = { messages: [], summary: "" };
    }
    if (file) {
        const fileBuffer = fs.readFileSync(file.path);
        const parser = new PDFParse({ data: fileBuffer });
        const data = await parser.getText();
        const text = data.text;
        logger.info({ filename: file.originalname }, "Parsed PDF content");
        fs.writeFileSync("uploads/file.txt", text, "utf8");
        await buildEmbeddings("uploads/file.txt");
    }
    const history = sessions[sessionId];
    if (!query) {
        res.status(400).json({ error: "Query required" });
        return;
    }
    try {
        const fileNames = file ? [file.originalname] : [];
        const stream = runToolAgent(query, history, sessionId, fileNames);
        let result = "";
        for await (const chunk of stream) {
            res.write(chunk);
            result += chunk;
        }
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
