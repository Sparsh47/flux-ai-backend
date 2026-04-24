import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import { env } from "../schema/env.js";

const qdrantClient = new QdrantClient({
    url: env.QDRANT_HTTP_URL
})

const collectionName = "flux_documents";

export async function setupAndRunQdrant() {

    const vectorDimension = 768;

    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some((collection) => collection.name === collectionName)

    if (collectionExists) {
        console.log(`⚠️ Collection '${collectionName}' exists.`);
    } else {
        console.log(`🚀 Creating collection '${collectionName}' with sparse vector support...`);
        await qdrantClient.createCollection(collectionName, {
            vectors: {
                size: vectorDimension,
                distance: "Cosine"
            },
            sparse_vectors: {
                text_keywords: {
                    modifier: "idf"
                }
            }
        });
        console.log(`✅ Collection '${collectionName}' created successfully.`);
    }

}

export async function insertVector(vector: number[], chunk: string) {
    await qdrantClient.upsert(collectionName, {
        wait: true,
        points: [
            {
                id: uuidv4(),
                vector: {
                    "": vector,
                    "text_keywords": generateSparseVector(chunk)
                },
                payload: {
                    chunk: chunk
                },
            }
        ]
    });
}

export async function searchVector(vector: number[], query: string) {

    const querySparse = generateSparseVector(query);

    const result = await qdrantClient.query(collectionName, {
        prefetch: [
            {
                query: vector,
                using: "",
                limit: 20
            },
            {
                query: querySparse,
                using: "text_keywords",
                limit: 20
            }
        ],
        query: {
            fusion: "rrf"
        },
        limit: 15,
    });

    return result
}

function generateSparseVector(text: string) {
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts: Record<string, number> = {};

    for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
    }

    const indices: number[] = [];
    const values: number[] = [];

    for (const [word, count] of Object.entries(wordCounts)) {
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
            hash = Math.imul(31, hash) + word.charCodeAt(i) | 0;
        }
        indices.push(Math.abs(hash));
        values.push(count);
    }

    return { indices, values };
}