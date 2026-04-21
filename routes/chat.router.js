import { Router } from "express";
import { sessions } from "../server.js";
import { runToolAgent } from "../tools.js";
import { updateMemory } from "../utils.js";
import { PDFParse } from "pdf-parse";
import fs from "fs"
import { buildEmbeddings } from "../buildEmbeddings.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
    const { query, sessionId = "default" } = req.body;
    const file = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!sessions[sessionId]) {
        sessions[sessionId] = { messages: [], summary: "" };
    }

    if (file) {
        const filePath = file.path;

        const parser = new PDFParse({ url: filePath })
        const data = await parser.getText()
        const text = data.text

        fs.writeFileSync("uploads/file.txt", text, "utf8");

        let fileCount = Date.now(); // Better than 0 to prevent accidental data overwrites when multiple files are sent

        await buildEmbeddings("uploads/file.txt", `${sessionId}-embeddings-${fileCount}.json`, `${sessionId}-clusters-${fileCount}.json`, 3);
    }

    const history = sessions[sessionId];

    if (!query) {
        return res.status(400).json({ error: "Query required" });
    }

    try {
        const fileNames = file ? [file.originalname] : [];
        const result = await runToolAgent(query, history, sessionId, fileNames);

        updateMemory(history, query, result, fileNames);

        res.json({
            result: result,
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            error: "RAG failed",
        });
    }
})