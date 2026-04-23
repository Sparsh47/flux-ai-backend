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
  async ({ a, b }: { a: number; b: number }) => {
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
  async ({ a, b }: { a: number; b: number }) => {
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
  async ({ a, b }: { a: number; b: number }) => {
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
  async ({ a, b }: { a: number; b: number }) => {
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
  async ({ text }: { text: string }) => {
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
  async ({ text }: { text: string }) => {
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
  async ({ text }: { text: string }) => {
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

export async function runTool(query: string) {
  const model = new ChatOllama({
    baseUrl: BASE_URL,
    model: MODEL,
    temperature: 0,
  } as any).bindTools(mathTools);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a strict API. Give only the final answer of the query in single word/number. Don't give explanation or any other information. Just provide the answer to the query. If you are not able to find the answer withing the available steps then just reply with I don't know the answer to that query.",
    ],
    ["human", "{input}"],
  ]);

  const agent = (prompt as any).pipe(model);

  const result: any = await agent.invoke({
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

interface Message {
  role: string;
  content: string;
  attachments?: string[];
}

interface History {
  messages: Message[];
  summary: string;
}

export async function* runToolAgent(
  query: string,
  history: History = { messages: [], summary: "" },
  sessionId: string = "default",
  fileNames: string[] = []
) {
  const hasFiles = fileNames && fileNames.length > 0;

  const ragSearch = tool(
    async ({ query: q }: { query: string }) => {
      console.log(`Running [ragSearch] with args: query="${q}"`);

      const rewrittenQuery = (await rewriteQuery(q, history)) || q;

      const result = await runRag(rewrittenQuery, history, sessionId);

      if (!result || result.trim().length < 30) {
        return "NO_DATA_FOUND";
      }

      return result;
    },
    {
      name: "ragSearch",
      description: `
Use this tool ONLY when the user has uploaded a document or attachment in this conversation.
Use it to answer questions about the contents of those uploaded files.
DO NOT use this tool for general knowledge, greetings, math, or string operations.
`,
      schema: z.object({
        query: z.string().describe("The question to search in the uploaded documents"),
      }),
    },
  );

  const chatFallback = tool(
    async ({ query: q }: { query: string }) => {
      console.log(`Running [generalChat] with args: query="${q}"`);
      return await runChat(q);
    },
    {
      name: "generalChat",
      description: `
Use for:
- greetings and casual conversation
- general knowledge questions when NO documents have been uploaded
- any query that does not require searching uploaded files
`,
      schema: z.object({
        query: z.string(),
      }),
    },
  );

  // Only expose ragSearch when the user has actually uploaded documents
  const allTools = hasFiles
    ? [...mathTools, ...stringTools, ragSearch, chatFallback]
    : [...mathTools, ...stringTools, chatFallback];

  const model = new ChatOllama({
    baseUrl: BASE_URL,
    model: MODEL,
    temperature: 0,
  } as any);

  const systemPrompt = `You are an intelligent assistant.

${history.summary ? `Previous conversation summary:\n${history.summary}\n` : ""}
${hasFiles
  ? `The user has uploaded the following file(s): ${fileNames.join(", ")}.
You have access to a ragSearch tool to look up content from these documents.
Use ragSearch when the user asks about the contents of these files.
Do NOT use ragSearch for unrelated general questions.`
  : `No documents have been uploaded in this conversation.
Do NOT use ragSearch — it will return nothing useful.
Answer general questions directly or use generalChat.`
}

FORMATTING RULES (highest priority):
- NEVER use markdown formatting (no **, no *, no #, no bullet lists with -, no backticks, no tables)
- Write in plain, natural prose
- ONLY use code blocks if the user explicitly asks a code-related question

GENERAL RULES:
- Use tools when appropriate
- When a tool returns information, use it in your answer
- Do NOT hallucinate
- Answer all parts of the question
- For string operations, use the EXACT text provided by the user

${hasFiles ? `RAG DATA RULE:
- If ragSearch returns "NO_DATA_FOUND", say "I don't have enough information in the uploaded documents."
- Do NOT fall back to general knowledge for document-specific questions` : ""}
`;

  const agent = createReactAgent({
    llm: model,
    tools: allTools,
    prompt: systemPrompt,
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


  const stream: any = await agent.streamEvents({
    messages: [
      ...formattedMessages,
      { role: "user", content: finalQuery }
    ]
  },
    { version: "v2" });

  console.log("Agent Response: ");

  for await (const event of stream) {
    const eventType = event.event;

    if (eventType === "on_chat_model_stream") {
      const chunk = event.data.chunk

      if (chunk.content) {
        yield chunk.content
      }
    }
  }

  console.log(`[Agent] Stream complete for query: "${query}"`);
}