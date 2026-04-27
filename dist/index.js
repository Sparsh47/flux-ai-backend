import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getEmbedding } from "./embedding.js";
import { BASE_URL, MODEL } from "./constants.js";
import { searchVector } from "./config/qdrant.config.js";
import { logger } from "./config/logger.js";
const model = new ChatOllama({
    baseUrl: BASE_URL,
    model: MODEL,
    temperature: 0,
});
export async function runRag(query, history, sessionId = "default", fileKeys = []) {
    try {
        const bestChunks = await retrieveChunks(query, history, sessionId, fileKeys);
        if (!bestChunks)
            return "";
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
        const chain = prompt.pipe(model);
        const inputs = {
            input: query,
            history: history.messages,
        };
        if (history.summary) {
            inputs.history = [{ role: "system", content: "Previous summary: " + history.summary }, ...inputs.history];
        }
        const res = await chain.invoke(inputs);
        return res.content;
    }
    catch (err) {
        console.error("Error encountered: ", err);
        return "";
    }
}
export async function runRAGStream(query, history, fileKeys = []) {
    try {
        const bestChunks = await retrieveChunks(query, history, "default", fileKeys);
        if (!bestChunks)
            return null;
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
        const chain = prompt.pipe(model);
        const inputs = {
            input: query,
            history: history.messages,
        };
        if (history.summary) {
            inputs.history = [{ role: "system", content: "Previous summary: " + history.summary }, ...inputs.history];
        }
        const stream = chain.stream(inputs);
        return stream;
    }
    catch (err) {
        console.error("Error encountered: ", err);
        return null;
    }
}
async function retrieveChunks(query, history, sessionId = "default", fileKeys = []) {
    try {
        const enrichedQuery = history.messages.length || history.summary
            ? history.summary + " " + history.messages.map((m) => m.content).join(" ") + " " + query
            : query;
        const queryEmbedding = await getEmbedding(enrichedQuery);
        const result = await searchVector(queryEmbedding, enrichedQuery, fileKeys);
        logger.debug({ sessionId, chunkCount: result.points.length }, "Retrieved chunks from Qdrant");
        const reranked = await rerankChunks(query, result.points.map((c) => c.payload?.chunk));
        return reranked.slice(0, 5);
    }
    catch (err) {
        logger.error({ err, sessionId }, "Failed to retrieve chunks");
        return [];
    }
}
async function rerankChunks(query, chunks) {
    try {
        const model = new ChatOllama({
            baseUrl: BASE_URL,
            model: MODEL,
            temperature: 0,
        });
        const modifiedChunks = chunks.map((c, i) => `${i}: ${c}`).join("\n\n");
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
        const agent = prompt.pipe(model);
        const result = await agent.invoke({
            query: query,
            chunks: modifiedChunks,
            input: query,
        });
        let indices;
        try {
            const match = result.content.match(/\[.*?\]/);
            indices = JSON.parse(match ? match[0] : result.content);
        }
        catch (parseError) {
            console.error("Failed to parse reranker indices:", result.content);
            return chunks;
        }
        const rerankedChunks = indices
            .map((i) => chunks[i])
            .filter((c) => c !== undefined);
        return rerankedChunks.length > 0 ? rerankedChunks : chunks;
    }
    catch (err) {
        console.error("Reranker failed:", err);
        return chunks;
    }
}
