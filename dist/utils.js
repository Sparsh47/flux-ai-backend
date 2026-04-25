import { BASE_URL, MODEL } from "./constants.js";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { prisma } from "./config/db.js";
export async function summarizeHistory(oldMessages, previousSummary) {
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
    return result.content.trim();
}
export async function updateMemory(session, query, answer, fileNames = [], sessionId = "default", userId = "default_user") {
    session.messages.push({ role: "user", content: query, attachments: fileNames });
    session.messages.push({ role: "assistant", content: answer });
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
    if (session.messages.length > 10) {
        const old = session.messages.slice(0, 6);
        session.summary = await summarizeHistory(old, session.summary);
        session.messages = session.messages.slice(6);
    }
}
