import { QdrantClient } from "@qdrant/js-client-rest";
import { v4 as uuidv4 } from "uuid";
import { env } from "../schema/env.js";
import { logger } from "./logger.js";
const qdrantClient = new QdrantClient({
    url: env.QDRANT_HTTP_URL
});
const collectionName = "flux_documents";
export async function setupAndRunQdrant() {
    const vectorDimension = 768;
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some((collection) => collection.name === collectionName);
    if (collectionExists) {
        logger.info({ collectionName }, "Qdrant collection exists");
    }
    else {
        logger.info({ collectionName }, "Creating Qdrant collection with sparse vector support");
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
        logger.info({ collectionName }, "Collection created successfully");
    }
}
export async function insertVector(vector, chunk, fileKey) {
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
                    chunk: chunk,
                    fileKey: fileKey
                },
            }
        ]
    });
}
export async function searchVector(vector, query, fileKeys = []) {
    const querySparse = generateSparseVector(query);
    let filter = undefined;
    if (fileKeys && fileKeys.length > 0) {
        filter = {
            must: [
                {
                    key: "fileKey",
                    match: {
                        any: fileKeys
                    }
                }
            ]
        };
    }
    const result = await qdrantClient.query(collectionName, {
        prefetch: [
            {
                query: vector,
                using: "",
                limit: 20,
                filter: filter
            },
            {
                query: querySparse,
                using: "text_keywords",
                limit: 20,
                filter: filter
            }
        ],
        query: {
            fusion: "rrf"
        },
        limit: 15,
        with_payload: true,
    });
    return result;
}
function generateSparseVector(text) {
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts = {};
    for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
    const indices = [];
    const values = [];
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
