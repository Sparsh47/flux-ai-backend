import { BASE_URL, MODEL } from "./constants.js";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { prisma } from "./config/db.js";
import { logger } from "./config/logger.js";
import redis from "./config/redis.js";
export async function summarizeHistory(oldMessages, sessionId) {
    const previousSummary = await getChatSummary(sessionId);
    const text = oldMessages.map(m => `${m.role}: ${m.content}`).join("\n");
    const model = new ChatOllama({
        baseUrl: BASE_URL,
        model: MODEL,
        temperature: 0,
    });
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
    const agent = prompt.pipe(model);
    const result = await agent.invoke({
        previousSummary: previousSummary,
        text: text,
    });
    const newSummary = result.content.trim();
    await redis.set(`summary:${sessionId}`, newSummary, "EX", 60 * 60 * 24 * 7);
    logger.info({ sessionId }, "Summary updated");
}
export async function updateMemory(history, query, answer, fileNames = [], sessionId = "default", userId = "default_user") {
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
    });
    if (history.messages.length > 10) {
        const old = history.messages.slice(0, 6);
        await summarizeHistory(old, sessionId);
        history.messages = history.messages.slice(6);
    }
}
export function normalize(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}
export async function getChatHistory(sessionId) {
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
        };
    }
    return {
        messages: []
    };
}
export async function getChatSummary(sessionId) {
    try {
        const redisKey = `summary:${sessionId}`;
        const cachedSummary = await redis.get(redisKey);
        if (cachedSummary) {
            return cachedSummary;
        }
        return "";
    }
    catch (err) {
        logger.error(err, "Error fetching chat summary");
        return "";
    }
}
