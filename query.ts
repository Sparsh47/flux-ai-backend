import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

import { logger } from "./config/logger.js";
import { normalize } from "./lib/utils.js";
import { createHash } from "crypto";
import redis from "./config/redis.js";

interface Message {
    role: string;
    content: string;
    attachments?: string[];
}

interface History {
    messages: Message[];
    summary: string;
}

export async function rewriteQuery(query: string, history: History): Promise<string | null> {

    if (!/\b(he|she|it|they|this|that|file|document|resume|pdf)\b/i.test(query)) {
        return query;
    }

    const model = new ChatOllama({
        baseUrl: BASE_URL,
        model: MODEL,
        temperature: 0,
    } as any);

    const parser = new StringOutputParser();

    const contextStr = history.messages
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
        return cached;
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

    const chain = (prompt as any).pipe(model).pipe(parser);

    const result = await chain.invoke({ input: query, context: contextStr, query: query }) as string;

    if (!result) {
        logger.warn({ query }, "Query rewriter returned empty result");
        return null;
    }

    logger.debug({ original: query, rewritten: result }, "Query rewritten");

    await redis.set(cacheKey, result, "EX", 3600);

    return result;
}
