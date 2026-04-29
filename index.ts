import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getEmbedding } from "./embedding.js";
import { BASE_URL, MODEL } from "./constants.js";
import { searchVector } from "./config/qdrant.config.js";
import { logger } from "./config/logger.js";
import pRetry from "p-retry";
import { trackLLMCost } from "./lib/cost.js";
import { Tool } from "@prisma/client";
import { RewriteResult } from "./query.js";
import { saveRAGTrace } from "./lib/trace.js";

const model = new ChatOllama({
  baseURL: BASE_URL,
  model: MODEL,
} as any);

interface Message {
  role: string;
  content: string;
}

interface History {
  messages: Message[];
  summary: string;
}

export async function runRag(
  query: string,
  history: History,
  sessionId: string = "default",
  fileKeys: string[] = [],
  rewriteInfo?: RewriteResult
) {
  const userId = sessionId;
  try {
    const { chunks: bestChunks, scores, count } = await retrieveChunks(query, history, userId, fileKeys);

    if (bestChunks.length === 0) {
      logger.warn({ sessionId, query }, "No chunks retrieved from Qdrant — returning empty");
      return "";
    }

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `Use ONLY the provided context.

        Return answer in plain natural language prose.
        Do NOT use markdown formatting (no **, no *, no #, no bullet lists with -, no backticks, no tables).
        ONLY use a code block if the user explicitly asks a code-related question.
        Do NOT return JSON.`,
      ],
      ["system", bestChunks.join("\n\n---\n\n")],
      ["placeholder", "{history}"],
      ["human", "{input}"],
    ]);

    const chain = (prompt as any).pipe(model);

    const inputs: any = {
      input: query,
      history: history.messages,
    };

    if (history.summary) {
      inputs.history = [{ role: "system", content: "Previous summary: " + history.summary }, ...inputs.history];
    }

    const llmStart = performance.now();
    const res: any = await pRetry(
      async () => {
        return await chain.invoke(inputs);
      },
      {
        retries: 3,
        factor: 2,
        onFailedAttempt: error => {
          logger.warn(
            { attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error: error },
            "RAG call failed, retrying..."
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
      sessionId,
      Tool.AGENT,
      MODEL,
      res,
      latencyMs
    );

    // Always save a RAG trace regardless of whether query rewriting occurred
    await saveRAGTrace({
      sessionId,
      originalQuery: rewriteInfo?.originalQuery ?? query,
      rewrittenQuery: rewriteInfo?.rewrittenQuery ?? null,
      cacheHit: rewriteInfo?.cacheHit ?? false,
      similarityScores: scores,
      chunksReturned: count,
      chunks: bestChunks,
    });

    return res.content;
  } catch (err) {
    console.error("Error encountered: ", err);
    return "";
  }
}

export async function runRAGStream(query: string, history: History, userId: string = "default", fileKeys: string[] = []) {
  try {
    const { chunks: bestChunks } = await retrieveChunks(query, history, userId, fileKeys);

    if (!bestChunks) return null;

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `Use ONLY the provided context.

        Return answer in plain natural language prose.
        Do NOT use markdown formatting (no **, no *, no #, no bullet lists with -, no backticks, no tables).
        ONLY use a code block if the user explicitly asks a code-related question.
        Do NOT return JSON.`,
      ],
      ["system", bestChunks.join("\n\n---\n\n")],
      ["placeholder", "{history}"],
      ["human", "{input}"],
    ]);

    const chain = (prompt as any).pipe(model);

    const inputs: any = {
      input: query,
      history: history.messages,
    };

    if (history.summary) {
      inputs.history = [{ role: "system", content: "Previous summary: " + history.summary }, ...inputs.history];
    }

    const stream = chain.stream(inputs);

    return stream;
  } catch (err) {
    console.error("Error encountered: ", err);
    return null;
  }
}

async function retrieveChunks(query: string, history: History, userId: string = "default", fileKeys: string[] = []) {
  try {
    const enrichedQuery = history.messages.length || history.summary
      ? history.summary + " " + history.messages.map((m) => m.content).join(" ") + " " + query
      : query;

    const queryEmbedding = await getEmbedding(enrichedQuery);

    const result: any = await searchVector(queryEmbedding, enrichedQuery, userId, fileKeys);

    logger.debug({ userId, chunkCount: result.points.length }, "Retrieved chunks from Qdrant");

    const rawPoints = result.points as Array<{ score: number; payload?: { chunk?: string } }>;
    const rawScores = rawPoints.map((p) => p.score);
    const rawChunks = rawPoints.map((p) => p.payload?.chunk as string);

    const reranked = await rerankChunks(query, rawChunks);
    const top5 = reranked.slice(0, 5);

    // Align scores to the reranked chunks so the trace is meaningful
    const top5Scores = top5.map((chunk) => {
      const originalIndex = rawChunks.indexOf(chunk);
      return originalIndex !== -1 ? rawScores[originalIndex] : 0;
    });

    return { chunks: top5, scores: top5Scores, count: rawPoints.length };
  } catch (err) {
    logger.error({ err, userId }, "Failed to retrieve chunks");
    return { chunks: [], scores: [], count: 0 };
  }
}

async function rerankChunks(query: string, chunks: string[]) {
  try {
    const model = new ChatOllama({
      baseURL: BASE_URL,
      model: MODEL,
      temperature: 0,
    } as any);

    const modifiedChunks = chunks.map((c, i) => `${i}: ${c}`).join("\n\n")

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a ranking system.

Given a query and a list of text chunks,
rank the chunks based on how well they answer the query.

Return ONLY the indices in sorted order (best first).

Query: {query}

Chunks: {chunks}

Output:
[best_index, second_best, ...]
`,
      ],
      ["human", "{input}"],
    ]);

    const agent = (prompt as any).pipe(model);

    const llmStart = performance.now();
    const result: any = await pRetry(
      async () => {
        return await agent.invoke({
          query: query,
          chunks: modifiedChunks,
          input: query,
        });
      },
      {
        retries: 3,
        factor: 2,
        onFailedAttempt: error => {
          logger.warn(
            { attempt: error.attemptNumber, retriesLeft: error.retriesLeft, error: error },
            "Reranker call failed, retrying..."
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

    // Track cost — tag as REWRITE since this is a reranking/sorting step, not the main generation
    await trackLLMCost(
      "system",
      Tool.REWRITE,
      MODEL,
      result,
      latencyMs
    );

    let indices: number[];
    try {
      const match = result.content.match(/\[.*?\]/);
      indices = JSON.parse(match ? match[0] : result.content);
    } catch (parseError) {
      console.error("Failed to parse reranker indices:", result.content);
      return chunks;
    }

    const rerankedChunks = indices
      .map((i) => chunks[i])
      .filter((c) => c !== undefined);

    return rerankedChunks.length > 0 ? rerankedChunks : chunks;
  } catch (err) {
    console.error("Reranker failed:", err);
    return chunks;
  }
}