import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import pRetry from "p-retry";
import { logger } from "./config/logger.js";
import { trackLLMCost } from "./lib/cost.js";
import { Tool } from "@prisma/client";

export async function runChat(query: string): Promise<string> {
  const model = new ChatOllama({
    baseURL: BASE_URL,
    model: MODEL,
    temperature: 0,
  } as any);

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

  const chain = (prompt as any).pipe(model);

  const llmStart = performance.now();
  const response: any = await pRetry(
    async () => {
      return await chain.invoke({
        input: query
      })
    },
    {
      retries: 3,
      factor: 2,
      onFailedAttempt: error => {
        logger.warn(
          { attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error: error },
          "LLM call failed, retrying..."
        );
      },
      shouldRetry: ({ error }: any) => {
        // only retry on transient errors, not on bad input
        const retryableCodes = [429, 500, 502, 503, 504]
        return retryableCodes.includes(error?.status) ||
          error?.message?.includes("timeout")
      }
    }
  )
  const latencyMs = performance.now() - llmStart;

  // Track cost
  await trackLLMCost(
    "system", // Use system or pass sessionId if available
    Tool.FALLBACK,
    MODEL,
    response,
    latencyMs
  );

  return response.content as string;
}
