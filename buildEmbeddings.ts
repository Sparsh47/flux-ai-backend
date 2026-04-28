import fs from "fs";
import { getEmbedding } from "./embedding.js";
import { insertVector } from "./config/qdrant.config.js";
import { logger } from "./config/logger.js";

export async function buildEmbeddings(inputFile: string, fileKey: string, userId: string) {
  logger.info({ inputFile, fileKey, userId }, "Building embeddings for file");
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
      await insertVector(embedding, chunk, fileKey, userId);
      totalStorageTime += (performance.now() - storeStart);
    }
    const buildEndTime = performance.now();
    
    return {
        embeddingTimeMs: totalEmbeddingTime,
        storageTimeMs: totalStorageTime,
        buildTotalTimeMs: buildEndTime - buildStartTime
    };
  } catch (err) {
    logger.error({ err, inputFile }, "Error building embeddings");
    throw err;
  }
}
