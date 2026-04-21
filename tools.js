import { tool } from "@langchain/core/tools";
import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { runRag } from "./index.js";
import { runChat } from "./chat.js";
import { rewriteQuery } from "./query.js";

const addTool = tool(
  async ({ a, b }) => {
    console.log(`Running [add_numbers] with args: a=${a}, b=${b}`);
    return a + b;
  },
  {
    name: "add_numbers",
    description: "Use ONLY for numeric addition like 2 + 3",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
  },
);

const subtractTool = tool(
  async ({ a, b }) => {
    console.log(`Running [subtract_numbers] with args: a=${a}, b=${b}`);
    return a - b;
  },
  {
    name: "subtract_numbers",
    description: "Use ONLY for numeric subtraction like 2 - 3",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
  },
);

const multiplyTool = tool(
  async ({ a, b }) => {
    console.log(`Running [multiply_numbers] with args: a=${a}, b=${b}`);
    return a * b;
  },
  {
    name: "multiply_numbers",
    description: "Use ONLY for numeric multiplication like 2 * 3",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
  },
);

const divideTool = tool(
  async ({ a, b }) => {
    console.log(`Running [divide_numbers] with args: a=${a}, b=${b}`);
    return a / b;
  },
  {
    name: "divide_numbers",
    description: "Use ONLY for numeric division like 2 / 3",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
  },
);

const mathTools = [addTool, subtractTool, multiplyTool, divideTool];

const toUpperCaseTool = tool(
  async ({ text }) => {
    console.log(`Running [to_uppercase] with args: text="${text}"`);
    return text.toUpperCase();
  },
  {
    name: "to_uppercase",
    description: "Convert a string to uppercase",
    schema: z.object({
      text: z.string(),
    }),
  },
);

const toLowerCaseTool = tool(
  async ({ text }) => {
    console.log(`Running [to_lowercase] with args: text="${text}"`);
    return text.toLowerCase();
  },
  {
    name: "to_lowercase",
    description: "Convert a string to lowercase",
    schema: z.object({
      text: z.string(),
    }),
  },
);

const getLengthTool = tool(
  async ({ text }) => {
    console.log(`Running [get_length] with args: text="${text}"`);
    return text.length;
  },
  {
    name: "get_length",
    description: "Get the length of a string (number of characters)",
    schema: z.object({
      text: z.string(),
    }),
  },
);

const stringTools = [toUpperCaseTool, toLowerCaseTool, getLengthTool];

export async function runTool(query) {
  const model = new ChatOllama({
    baseUrl: BASE_URL,
    model: MODEL,
    temperature: 0,
  }).bindTools(mathTools);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a strict API. Give only the final answer of the query in single word/number. Don't give explanation or any other information. Just provide the answer to the query. If you are not able to find the answer withing the available steps then just reply with I don't know the answer to that query.",
    ],
    ["human", "{input}"],
  ]);

  const agent = prompt.pipe(model);

  const result = await agent.invoke({
    input: query,
  });

  for (const call of result.tool_calls) {
    const selectedTool = mathTools.find((tool) => tool.name === call.name);
    if (selectedTool) {
      const toolResponse = await selectedTool.invoke(call.args);

      return toolResponse;
    }
  }
}

export async function runToolAgent(query, history = { messages: [], summary: "" }, sessionId = "default", fileNames = []) {
  const ragSearch = tool(
    async ({ query: q }) => {
      console.log(`Running [ragSearch] with args: query="${q}"`);

      const rewrittenQuery = await rewriteQuery(q, history);

      const result = await runRag(rewrittenQuery, history, sessionId);

      if (!result || result.trim().length < 30) {
        return "NO_DATA_FOUND";
      }

      return result;
    },
    {
      name: "ragSearch",
      description: `
Use this tool for:
- questions about people (e.g., Sparsh)
- questions about projects (e.g., Nexum)
- factual queries
- queries with pronouns (he, she, his, etc.)
- queries depending on previous conversation
- questions concerning attached files and uploaded documents

You MUST use this tool before answering such questions.
`,
      schema: z.object({
        query: z.string().describe("The question to search in the knowledge base"),
      }),
    },
  );

  const chatFallback = tool(
    async ({ query: q }) => {
      console.log(`Running [generalChat] with args: query="${q}"`);
      return await runChat(q);
    },
    {
      name: "generalChat",
      description: `
Use ONLY for:
- greetings
- casual conversation

DO NOT use for:
- factual questions
- questions about people or projects
`,
      schema: z.object({
        query: z.string(),
      }),
    },
  );

  const allTools = [...mathTools, ...stringTools, ragSearch, chatFallback];

  const model = new ChatOllama({
    baseUrl: BASE_URL,
    model: MODEL,
    temperature: 0,
  });

  const agent = createReactAgent({
    llm: model,
    tools: allTools,
    maxIterations: 5,
    prompt: `You are an intelligent agent.

${history.summary ? `Previous Summary:\n${history.summary}` : ""}

Rules:
- Use tools when needed
- When a tool returns information, you MUST use it
- Do NOT ignore tool results
- Do NOT hallucinate
- Answer ALL parts of the question

TOOL RULES:
- If query is about people, projects, or facts → ALWAYS use ragSearch
- If query contains pronouns (he, she, it, his, their) → ALWAYS use ragSearch
- If query asks about an attached file, document, or uploaded text → ALWAYS use ragSearch
- If unsure → use ragSearch
- DO NOT guess without using ragSearch first

IMPORTANT:
- If ragSearch has already been used → DO NOT call it again
- Use the result and answer

NO DATA RULE:
- If ragSearch returns "NO_DATA_FOUND":
  → Say "I don't have enough information"
  → DO NOT hallucinate
  → DO NOT use general knowledge

STRING RULE:
- For string operations, use EXACT text from user
- DO NOT expand using RAG results
`,
  });

  const formattedMessages = history.messages.map((h) => {
    let content = h.content;
    if (h.attachments && h.attachments.length > 0) {
      content = `[Attached Files: ${h.attachments.join(", ")}]\n${content}`;
    }
    return { role: h.role, content };
  });

  let finalQuery = query;
  if (fileNames && fileNames.length > 0) {
    finalQuery = `[Attached Files: ${fileNames.join(", ")}]\n${query}`;
  }

  const result = await agent.invoke({
    messages: [
      ...formattedMessages,
      { role: "user", content: finalQuery },
    ],
  });

  const usedTools = result.messages.some(
    (m) => m.tool_calls && m.tool_calls.length > 0,
  );

  if (!usedTools) {
    console.log(
      `[Agent] Answered directly from memory without using any tools for query: "${query}"`,
    );
  }

  const lastMessage = result.messages.at(-1);
  return lastMessage?.content ?? "";
}