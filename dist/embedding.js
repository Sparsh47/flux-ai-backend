import { BASE_URL } from "./constants.js";
export async function getEmbedding(query) {
    const res = await fetch(`${BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "nomic-embed-text",
            prompt: query,
        }),
    });
    const data = await res.json();
    return data.embedding;
}
export function cosineSimilarity(a, b) {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    return dot / (magA * magB);
}
export function getCentroid(cluster) {
    const dim = cluster[0].embedding.length;
    const centroid = new Array(dim).fill(0);
    for (const item of cluster) {
        for (let i = 0; i < dim; i++) {
            centroid[i] += item.embedding[i];
        }
    }
    for (let i = 0; i < dim; i++) {
        centroid[i] /= cluster.length;
    }
    return centroid;
}
