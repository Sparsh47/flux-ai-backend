import { BASE_URL, MODEL } from "./constants.js";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";

interface Message {
    role: string;
    content: string;
    attachments?: string[];
}

interface Session {
    messages: Message[];
    summary: string;
}

export async function summarizeHistory(oldMessages: Message[], previousSummary: string): Promise<string> {
    const text = oldMessages.map(m => `${m.role}: ${m.content}`).join("\n");

    const model = new ChatOllama({
        baseUrl: BASE_URL,
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

    const result: any = await agent.invoke({
        previousSummary: previousSummary,
        text: text,
    });

    return (result.content as string).trim();
}

export async function updateMemory(session: Session, query: string, answer: string, fileNames: string[] = []) {
    session.messages.push({ role: "user", content: query, attachments: fileNames });
    session.messages.push({ role: "assistant", content: answer });

    if (session.messages.length > 10) {
        const old = session.messages.slice(0, 6);

        session.summary = await summarizeHistory(old, session.summary);

        session.messages = session.messages.slice(6);
    }
}