import fs from "fs";
import { getEmbedding } from "./embedding.js";
import { insertVector } from "./config/qdrant.config.js";
import { logger } from "./config/logger.js";

export async function buildEmbeddings(inputFile: string, fileKey: string) {
  logger.info({ inputFile, fileKey }, "Building embeddings for file");
  try {
    const fileContent: string = fs.readFileSync(inputFile, "utf8");
    const chunks = fileContent.split("\n").filter((chunk: string) => chunk.trim() !== "");

    logger.debug({ chunkCount: chunks.length }, "Starting embedding generation");

    let totalEmbeddingTime = 0;
    let totalStorageTime = 0;
    const buildStartTime = performance.now();

    for await (const chunk of chunks) {
      const embStart = performance.now();
      const embedding = await getEmbedding(chunk);
      totalEmbeddingTime += (performance.now() - embStart);

      const storeStart = performance.now();
      await insertVector(embedding, chunk, fileKey);
      totalStorageTime += (performance.now() - storeStart);
    }
    const buildEndTime = performance.now();
    logger.info({ 
        inputFile, 
        embeddingTimeSec: (totalEmbeddingTime / 1000).toFixed(2),
        vectorStorageTimeSec: (totalStorageTime / 1000).toFixed(2),
        totalTimeSec: ((buildEndTime - buildStartTime) / 1000).toFixed(2)
    }, "Successfully built and stored embeddings");
  } catch (err) {
    logger.error({ err, inputFile }, "Error building embeddings");
    throw err;
  }
}
