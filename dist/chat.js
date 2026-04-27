import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import pRetry from "p-retry";
import { logger } from "./config/logger.js";
export async function runChat(query) {
    const model = new ChatOllama({
        baseUrl: BASE_URL,
        model: MODEL,
        temperature: 0,
    });
    const prompt = ChatPromptTemplate.fromMessages([
        [
            "system",
            `You are a helpful conversational assistant.
Respond in plain natural language prose.
Do NOT use markdown formatting (no **, no *, no #, no bullet lists with -, no backticks, no tables).
ONLY use a code block if the user explicitly asks a code-related question.`,
        ],
        ["human", "{input}"],
    ]);
    const chain = prompt.pipe(model);
    const response = await pRetry(async () => {
        return await chain.invoke({
            input: query
        });
    }, {
        retries: 3,
        factor: 2,
        onFailedAttempt: error => {
            logger.warn({ attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error: error }, "LLM call failed, retrying...");
        },
        shouldRetry: ({ error }) => {
            // only retry on transient errors, not on bad input
            const retryableCodes = [429, 500, 502, 503, 504];
            return retryableCodes.includes(error?.status) ||
                error?.message?.includes("timeout");
        }
    });
    return response.content;
}
