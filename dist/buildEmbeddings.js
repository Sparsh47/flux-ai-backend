import fs from "fs";
import { getEmbedding } from "./embedding.js";
import { insertVector } from "./config/qdrant.config.js";
import { logger } from "./config/logger.js";
export async function buildEmbeddings(inputFile, fileKey) {
    logger.info({ inputFile, fileKey }, "Building embeddings for file");
    try {
        const fileContent = fs.readFileSync(inputFile, "utf8");
        const chunks = fileContent.split("\n").filter((chunk) => chunk.trim() !== "");
        logger.debug({ chunkCount: chunks.length }, "Starting embedding generation");
        for await (const chunk of chunks) {
            const embedding = await getEmbedding(chunk);
            await insertVector(embedding, chunk, fileKey);
        }
        logger.info({ inputFile }, "Successfully built and stored embeddings");
    }
    catch (err) {
        logger.error({ err, inputFile }, "Error building embeddings");
        throw err;
    }
}
