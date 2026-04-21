import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

/**
 * Extracts the first JSON object from a string, handling markdown fences
 * and any surrounding prose that local models like llama3.1 tend to add.
 */
function extractJson(text) {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const stripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();

  // Find the first {...} block
  const match = stripped.match(/\{[\s\S]*?\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function routeQuery(query) {
  const model = new ChatOllama({
    baseUrl: BASE_URL,
    model: MODEL,
    temperature: 0,
  });

  const lower = query.toLowerCase();

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a routing agent.

      Decide:
      - "tool"
      - "rag"
      - "direct"

      Rules (apply in order, first match wins):
      - math or arithmetic calculations -> tool
      - string operations -> tool
      - ANY question about Sparsh — including "who is Sparsh?", his background, skills, projects (Creati AI, Cosmo, GhostDesk, Go TCP protocol), philosophy, or references to him via pronouns like "he", "his", "him" -> tool
        NOTE: Sparsh is a private individual, NOT a globally known public figure. Do NOT route him to "direct".
      - general world knowledge, globally known public figures, or casual conversational greetings -> direct

      Return ONLY JSON in this format:
      {{ "route": "tool" }}

      You will be given the conversation history and the latest user query.
      Focus ONLY on the intent of the LAST user query.
      Use the previous text ONLY for resolving references like "he", "she", "it", or "this".`,
    ],
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  const raw = await chain.invoke({ input: lower });

  const parsed = extractJson(raw);

  if (!parsed || !parsed.route) {
    console.warn("Router could not parse response, defaulting to 'direct'. Raw:", raw);
    return { route: "direct" };
  }

  console.log("ROUTER RAW:", raw, "→ PARSED:", parsed);
  return parsed;
}
