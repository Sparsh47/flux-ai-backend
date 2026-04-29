import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

import { logger } from "./config/logger.js";
import { normalize } from "./lib/utils.js";
import { createHash } from "crypto";
import redis from "./config/redis.js";
import pRetry from "p-retry";
import { trackLLMCost } from "./lib/cost.js";
import { Tool } from "@prisma/client";

interface Message {
    role: string;
    content: string;
    attachments?: string[];
}

interface History {
    messages: Message[];
    summary: string;
}

export interface RewriteResult {
    query: string;
    originalQuery: string;
    rewrittenQuery: string | null;
    cacheHit: boolean;
}

export async function rewriteQuery(query: string, history: History, fileNames: string[] = []): Promise<RewriteResult> {

    // Trigger rewrite if the query is vague, short, or references a document/pronoun
    const needsRewrite = (
        query.trim().split(/\s+/).length <= 3 ||
        /\b(he|she|it|they|this|that|its|their|him|her|them)\b/i.test(query) ||
        /\b(file|document|resume|pdf|attachment|report|the doc|the file)\b/i.test(query) ||
        /^(summarize|explain|describe|analyze|review|tell me|what is|what does|give me|show me|what's)/i.test(query.trim())
    );

    if (!needsRewrite) {
        return { query, originalQuery: query, rewrittenQuery: null, cacheHit: false };
    }

    const model = new ChatOllama({
        baseURL: BASE_URL,
        model: MODEL,
        temperature: 0,
    } as any);

    // Prepend current attached files context so the rewriter knows what documents are in scope
    const attachedFilesContext = fileNames.length > 0
        ? `[Currently attached files: ${fileNames.join(", ")}]\n`
        : "";

    const contextStr = attachedFilesContext + history.messages
        .slice(-4)
        .map((m) => {
            let c = `${m.role}: ${m.content}`;
            if (m.attachments && m.attachments.length > 0) {
                c += ` (Attached: ${m.attachments.join(", ")})`;
            }
            return c;
        })
        .join("\n");

    const input = JSON.stringify({
        message: normalize(query),
        history: history.messages.map(m => ({
            role: m.role,
            content: normalize(m.content)
        }))
    });

    const cacheKey = `rewrite:${createHash('sha256').update(input).digest('hex')}`;

    const cached = await redis.get(cacheKey);

    if (cached) {
        logger.debug({ cacheKey }, "Cache hit");
        return { query: cached, originalQuery: query, rewrittenQuery: cached, cacheHit: true };
    }

    const prompt = ChatPromptTemplate.fromMessages([
        [
            "system",
            `You are a query rewriter.

Rules:
- Replace pronouns (he, she, it, his, their) using conversation context
- If the user refers to "this file", "the document", or similar vague nouns, replace it with the explicit name of the attached file outlined in the conversation context.
- ALWAYS make the query standalone
- NEVER return the same query if it contains pronouns or vague document references

Examples:
"What does he do?" → "What does Sparsh Shandilya do?"
"What projects has he built?" → "What projects has Sparsh Shandilya built?"
"Summarize this file" → "Summarize the [Resume.pdf] file"
"What is this document about?" → "What is the [Example.txt] document about?"

Conversation:
{context}

User Query:
{query}

Rewritten Query:`,
        ],
        ["human", "{input}"],
    ]);

    const chain = (prompt as any).pipe(model);

    const llmStart = performance.now();
    const result: any = await pRetry(
        async () => {
            return await chain.invoke({ input: query, context: contextStr, query: query });
        },
        {
            retries: 3,
            factor: 2,
            onFailedAttempt: error => {
                logger.warn(
                    { attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error: error },
                    "Query rewriter call failed, retrying..."
                );
            },
            shouldRetry: ({ error }: any) => {
                const retryableCodes = [429, 500, 502, 503, 504]
                return retryableCodes.includes(error?.status) ||
                    error?.message?.includes("timeout")
            }
        }
    )
    const latencyMs = performance.now() - llmStart;

    // Track cost
    await trackLLMCost(
        "system",
        Tool.REWRITE,
        MODEL,
        result,
        latencyMs
    );

    const rewrittenContent = result.content;

    if (!rewrittenContent) {
        logger.warn({ query }, "Query rewriter returned empty result");
        return { query, originalQuery: query, rewrittenQuery: null, cacheHit: false };
    }

    logger.debug({ original: query, rewritten: rewrittenContent }, "Query rewritten");

    await redis.set(cacheKey, rewrittenContent, "EX", 3600);

    return { query: rewrittenContent, originalQuery: query, rewrittenQuery: rewrittenContent, cacheHit: false };
}
