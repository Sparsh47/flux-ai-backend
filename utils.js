import { BASE_URL, MODEL } from "./constants.js";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";

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

export async function updateMemory(session, query, answer, fileNames = []) {
    session.messages.push({ role: "user", content: query, attachments: fileNames });
    session.messages.push({ role: "assistant", content: answer });

    if (session.messages.length > 10) {
        const old = session.messages.slice(0, 6);

        session.summary = await summarizeHistory(old, session.summary);

        session.messages = session.messages.slice(6);
    }
}