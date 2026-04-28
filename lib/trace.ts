import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";

export interface RAGTraceInput {
    sessionId: string;
    originalQuery: string;
    rewrittenQuery: string | null;
    cacheHit: boolean;
    similarityScores: number[];
    chunksReturned: number;
    toolSelected: string;
}

export async function saveRAGTrace(input: RAGTraceInput) {
    try {
        await prisma.ragTrace.create({
            data: {
                sessionId: input.sessionId,
                originalQuery: input.originalQuery,
                rewrittenQuery: input.rewrittenQuery,
                cacheHit: input.cacheHit,
                similarityScores: input.similarityScores,
                chunksReturned: input.chunksReturned,
                toolSelected: input.toolSelected,
            }
        });
        logger.debug({ sessionId: input.sessionId }, "RAG trace saved successfully");
    } catch (error) {
        logger.error({ error, sessionId: input.sessionId }, "Failed to save RAG trace");
    }
}
