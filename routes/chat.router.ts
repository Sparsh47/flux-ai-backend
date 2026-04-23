import { Router, Request, Response } from "express";
import { sessions } from "../server.js";
import { runToolAgent } from "../tools.js";
import { updateMemory } from "../utils.js";
// @ts-ignore
import { PDFParse } from "pdf-parse";
import fs from "fs"
import { buildEmbeddings } from "../buildEmbeddings.js";

export const chatRouter = Router();

chatRouter.post("/", async (req: Request, res: Response) => {
    const { query, sessionId = "default" } = req.body;
    const files = (req.files as Express.Multer.File[]) || [];
    const file = files.length > 0 ? files[0] : null;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!sessions[sessionId]) {
        sessions[sessionId] = { messages: [], summary: "" };
    }

    if (file) {
        const filePath = file.path;

        // Note: PDFParse usage from original code
        const parser = new (PDFParse as any)({ url: filePath })
        const data = await parser.getText()
        const text = data.text

        fs.writeFileSync("uploads/file.txt", text, "utf8");

        let fileCount = Date.now();

        await buildEmbeddings("uploads/file.txt", `${sessionId}-embeddings-${fileCount}.json`, `${sessionId}-clusters-${fileCount}.json`, 3);
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
            res.write(chunk)
            result += (chunk as string)
        }

        updateMemory(history, query, result, fileNames);

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