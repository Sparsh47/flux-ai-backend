import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export async function runChat(query) {
  const model = new ChatOllama({
    baseUrl: BASE_URL,
    model: MODEL,
    temperature: 0,
  });

  const prompt = ChatPromptTemplate.fromMessages([["human", "{input}"]]);

  const chain = prompt.pipe(model);

  const response = await chain.invoke({
    input: query,
  });

  return response.content;
}
