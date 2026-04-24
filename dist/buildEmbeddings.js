import fs from "fs";
import { getEmbedding } from "./embedding.js";
import { insertVector } from "./config/qdrant.config.js";
// interface EmbeddingObject {
//   id: number;
//   chunk: string;
//   embedding: number[];
// }
export async function buildEmbeddings(inputFile = "note.txt", embeddingsFile = "embeddings.json", clustersFile = "clusters.json", numClusters = 3) {
    // let embeddings: EmbeddingObject[] = [];
    // const clusters: EmbeddingObject[][] = Array.from({ length: numClusters }, () => []);
    try {
        const fileContent = fs.readFileSync(inputFile, "utf8");
        const chunks = fileContent.split("\n").filter((chunk) => chunk.trim() !== "");
        // let id = 1;
        for await (const chunk of chunks) {
            const embedding = await getEmbedding(chunk);
            await insertVector(embedding, chunk);
            // embeddings.push({
            //   id: id,
            //   chunk: chunk,
            //   embedding: embedding,
            // });
            // id++;
        }
        // Distribute embeddings into clusters
        // embeddings.forEach((embedding, i) => {
        //   const clusterIndex = i % numClusters;
        //   clusters[clusterIndex].push(embedding);
        // });
        // Write the files
        // fs.writeFileSync(`embeddings/${embeddingsFile}`, JSON.stringify(embeddings, null, 2));
        // fs.writeFileSync(`clusters/${clustersFile}`, JSON.stringify(clusters, null, 2));
        //     console.log(`Successfully built embeddings and clusters:
        // - Input: ${inputFile}
        // - Embeddings: ${embeddingsFile}
        // - Clusters: ${clustersFile}`);
        // return { embeddings, clusters };
    }
    catch (err) {
        console.error("Error building embeddings: ", err);
        throw err;
    }
}
