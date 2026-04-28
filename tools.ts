import { tool } from "@langchain/core/tools";
import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { runRag } from "./index.js";
import { runChat } from "./chat.js";
import { rewriteQuery } from "./query.js";
import { logger } from "./config/logger.js";
import { AIMessageChunk } from "langchain";
import pRetry from "p-retry";
import { trackLLMCost } from "./lib/cost.js";
import { Tool } from "@prisma/client";

const addTool = tool(
  async ({ a, b }: { a: number; b: number }) => {
    logger.info({ a, b }, "Running add_numbers tool");
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
    logger.info({ a, b }, "Running subtract_numbers tool");
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
    logger.info({ a, b }, "Running multiply_numbers tool");
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
    logger.info({ a, b }, "Running divide_numbers tool");
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
    logger.info({ text }, "Running to_uppercase tool");
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
    logger.info({ text }, "Running to_lowercase tool");
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
    logger.info({ text }, "Running get_length tool");
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

  const llmStart = performance.now();
  const result: any = await pRetry(
    async () => {
      return await agent.invoke({
        input: query,
      });
    },
    {
      retries: 3,
      factor: 2,
      onFailedAttempt: error => {
        logger.warn(
          { attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error: error },
          "Tool call failed, retrying..."
        );
      },
      shouldRetry: ({ error }: any) => {
        const retryableCodes = [429, 500, 502, 503, 504]
        return retryableCodes.includes(error?.status) ||
          error?.message?.includes("timeout")
      }
    }
  )
  const latencyMs = performance.now() - llmStart;

  // Track cost
  await trackLLMCost(
    "system",
    Tool.AGENT,
    MODEL,
    result,
    latencyMs
  );

  for (const call of result.tool_calls) {
    const selectedTool = mathTools.find((tool) => tool.name === call.name);
    if (selectedTool) {
      const toolResponse = await pRetry(
        async () => {
          return await selectedTool.invoke(call.args);
        },
        {
          retries: 3,
          factor: 2,
          onFailedAttempt: error => {
            logger.warn(
              { attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error: error },
              "Tool response generation failed, retrying..."
            );
          },
          shouldRetry: ({ error }: any) => {
            const retryableCodes = [429, 500, 502, 503, 504]
            return retryableCodes.includes(error?.status) ||
              error?.message?.includes("timeout")
          }
        }
      )

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
  files: any[] = []
) {
  const hasFiles = files && files.length > 0;
  const fileNames = files.map(f => typeof f === 'string' ? f.split("/").pop() : f.name);
  const fileKeys = files.map(f => typeof f === 'string' ? f : f.key);

  const ragSearch = tool(
    async ({ query: q }: { query: string }) => {
      logger.info({ query: q }, "Running ragSearch tool");

      const rewriteResult = await rewriteQuery(q, history);
      const rewrittenQuery = rewriteResult.query;

      const result = await runRag(rewrittenQuery, history, sessionId, fileKeys, rewriteResult);

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
      logger.info({ query: q }, "Running generalChat tool");
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
    maxRetries: 3,
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

  const agentStart = performance.now();
  for await (const event of stream) {
    const eventType = event.event;

    if (eventType === "on_chat_model_stream") {
      const chunk = event.data.chunk

      if (chunk.content) {
        yield chunk.content
      }

      // Capture usage metadata from streaming events
      if (chunk.usage_metadata) {
        const latencyMs = performance.now() - agentStart;
        await trackLLMCost(sessionId, Tool.AGENT, MODEL, chunk, latencyMs);
      }
    }
  }

  const totalTime = performance.now() - agentStart;
  logger.info({ query, sessionId, totalTime: totalTime.toFixed(0) }, "Agent stream complete");
}