import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

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

  const response = await chain.invoke({
    input: query,
  });

  return response.content;
}
