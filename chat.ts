import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export async function runChat(query: string): Promise<string> {
  const model = new ChatOllama({
    baseUrl: BASE_URL,
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

  const response: any = await chain.invoke({
    input: query,
  });

  return response.content as string;
}
