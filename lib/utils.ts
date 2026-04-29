import { BASE_URL, MODEL } from "../constants.js";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import redis from "../config/redis.js";
import pRetry from "p-retry";
import { trackLLMCost } from "./cost.js";
import { Tool } from "@prisma/client";

interface Message {
    role: string;
    content: string;
    attachments?: string[];
}

interface Session {
    messages: Message[];
    summary: string;
}

export async function summarizeHistory(oldMessages: Message[], sessionId: string) {

    const previousSummary = await getChatSummary(sessionId);

    const text = oldMessages.map(m => `${m.role}: ${m.content}`).join("\n");

    const model = new ChatOllama({
        baseURL: BASE_URL,
        model: MODEL,
        temperature: 0,
    } as any);

    const prompt = ChatPromptTemplate.fromMessages([
        [
            "system",
            `
You are a summarizer.

Update the existing summary with new conversation.

Previous Summary: {previousSummary}

New Messages: {text}

Return a concise updated summary.
`,
        ]
    ]);

    const agent = (prompt as any).pipe(model);

    const llmStart = performance.now();
    const result: any = await pRetry(
        async () => {
            return await agent.invoke({
                previousSummary: previousSummary,
                text: text,
            });
        },
        {
            retries: 3,
            factor: 2,
            onFailedAttempt: error => {
                logger.warn(
                    { attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error: error },
                    "Summary generation call failed, retrying..."
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
        sessionId,
        Tool.SUMMARY,
        MODEL,
        result,
        latencyMs
    );

    const newSummary = (result.content as string).trim();

    await redis.set(`summary:${sessionId}`, newSummary, "EX", 60 * 60 * 24 * 7);

    logger.info({ sessionId }, "Summary updated");
}

export async function updateMemory(history: Session, query: string, answer: string, fileNames: string[] = [], sessionId: string = "default", userId: string = "default_user") {
    await prisma.conversation.upsert({
        where: {
            id: sessionId
        },
        create: {
            id: sessionId,
            title: query.slice(0, 50),
            userId: userId,
            messages: {
                create: [
                    { role: "USER", content: query },
                    { role: "ASSISTANT", content: answer }
                ]
            }
        },
        update: {
            messages: {
                create: [
                    { role: "USER", content: query },
                    { role: "ASSISTANT", content: answer }
                ]
            }
        }
    })

    if (history.messages.length > 10) {
        const old = history.messages.slice(0, 6);

        await summarizeHistory(old, sessionId);

        history.messages = history.messages.slice(6);
    }
}

export function normalize(text: string) {
    return text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
}

export async function getChatHistory(sessionId: string) {
    const conversation = await prisma.conversation.findUnique({
        where: {
            id: sessionId
        },
        select: {
            messages: {
                select: {
                    role: true,
                    content: true,
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 10
            }
        }
    });

    if (conversation && conversation.messages.length > 0) {
        return {
            messages: conversation.messages.reverse().map(msg => ({
                role: msg.role.toLowerCase(),
                content: msg.content
            }))
        }
    }

    return {
        messages: []
    }
}

export async function getChatSummary(sessionId: string) {
    try {
        const redisKey = `summary:${sessionId}`;
        const cachedSummary = await redis.get(redisKey);

        if (cachedSummary) {
            return cachedSummary;
        }

        return ""
    } catch (err) {
        logger.error(err, "Error fetching chat summary");
        return "";
    }
}

export async function unloadModel(modelName: string) {
    try {
        logger.info("Unloading embedding model to free memory...");
        await fetch(`${BASE_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: modelName,
                keep_alive: 0
            })
        });
    } catch (e) {
        logger.error("Failed to unload embedding model");
    }
}