import fs from "fs";
import { getEmbedding } from "./embedding.js";
import { insertVector } from "./config/qdrant.config.js";

export async function buildEmbeddings(inputFile: string) {
  try {
    const fileContent: string = fs.readFileSync(inputFile, "utf8");
    const chunks = fileContent.split("\n").filter((chunk: string) => chunk.trim() !== "");

    for await (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);

      await insertVector(embedding, chunk);
    }

  } catch (err) {
    console.error("Error building embeddings: ", err);
    throw err;
  }
}
