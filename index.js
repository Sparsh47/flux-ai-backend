import fs from "fs";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { cosineSimilarity, getCentroid, getEmbedding } from "./embedding.js";
import { BASE_URL, MODEL } from "./constants.js";

const model = new ChatOllama({
  baseUrl: BASE_URL,
  model: MODEL,
  temperature: 0,
});

export async function runRag(query, history, sessionId = "default") {
  try {
    const bestChunks = await retrieveChunks(query, history, sessionId);

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
  } catch (err) {
    console.error("Error encountered: ", err);
  }
}

export async function runRAGStream(query, history) {
  try {
    const bestChunks = await retrieveChunks(query, history);

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
  } catch (err) {
    console.error("Error encountered: ", err);
  }
}

async function retrieveChunks(query, history, sessionId = "default") {
  let bestChunks = [];
  const folderPath = "./clusters";

  try {
    const enrichedQuery = history.messages.length || history.summary
      ? history.summary + " " + history.messages.map((m) => m.content).join(" ") + " " + query
      : query;

    const queryEmbedding = await getEmbedding(enrichedQuery);

    let clusters = [];

    try {
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        const filteredFiles = files.filter(file => file.startsWith(sessionId));

        if (filteredFiles.length > 0) {
          for (const file of filteredFiles) {
            console.log("Using session cluster:", file);
            clusters.push(...JSON.parse(fs.readFileSync(`clusters/${file}`, "utf8")));
          }
        }
      }
    } catch (err) {
      console.error("Failed to load custom clusters:", err);
    }

    if (clusters.length === 0) {
      console.log("No custom clusters found for session, using native fallback clusters.");
      clusters = JSON.parse(fs.readFileSync("clusters.json", "utf8"));
    }

    const clusterScores = clusters.map((cluster) => {
      const centroid = getCentroid(cluster);

      const score = cosineSimilarity(centroid, queryEmbedding);

      return { cluster, score };
    });

    clusterScores.sort((a, b) => b.score - a.score);

    const topClusters = clusterScores.slice(0, 2);

    const combined = topClusters.flatMap((c) => c.cluster);

    const scored = combined.map((item) => {
      const semanticScore = cosineSimilarity(item.embedding, queryEmbedding);
      const keywordMatch = keywordScore(enrichedQuery, item.chunk);

      const score = 0.7 * semanticScore + 0.3 * keywordMatch;

      return {
        text: item.chunk,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const reranked = await rerankChunks(query, scored.map((c) => c.text));

    bestChunks = reranked.slice(0, 5);

    return bestChunks;
  } catch (err) { }
}

function keywordScore(query, text) {
  const words = query.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();

  let matches = 0;

  for (const word of words) {
    if (textLower.includes(word)) {
      matches++;
    }
  }

  return matches / words.length;
}

async function rerankChunks(query, chunks) {
  try {
    const model = new ChatOllama({
      baseUrl: BASE_URL,
      model: MODEL,
      temperature: 0,
    });

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