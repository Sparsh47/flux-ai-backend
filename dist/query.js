import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { logger } from "./config/logger.js";
export async function rewriteQuery(query, history) {
    if (!/\b(he|she|it|they|this|that|file|document|resume|pdf)\b/i.test(query)) {
        return query;
    }
    const model = new ChatOllama({
        baseUrl: BASE_URL,
        model: MODEL,
        temperature: 0,
    });
    const parser = new StringOutputParser();
    const contextStr = history.messages
        .slice(-4)
        .map((m) => {
        let c = `${m.role}: ${m.content}`;
        if (m.attachments && m.attachments.length > 0) {
            c += ` (Attached: ${m.attachments.join(", ")})`;
        }
        return c;
    })
        .join("\n");
    const prompt = ChatPromptTemplate.fromMessages([
        [
            "system",
            `You are a query rewriter.

Rules:
- Replace pronouns (he, she, it, his, their) using conversation context
- If the user refers to "this file", "the document", or similar vague nouns, replace it with the explicit name of the attached file outlined in the conversation context.
- ALWAYS make the query standalone
- NEVER return the same query if it contains pronouns or vague document references

Examples:
"What does he do?" → "What does Sparsh Shandilya do?"
"What projects has he built?" → "What projects has Sparsh Shandilya built?"
"Summarize this file" → "Summarize the [Resume.pdf] file"
"What is this document about?" → "What is the [Example.txt] document about?"

Conversation:
{context}

User Query:
{query}

Rewritten Query:`,
        ],
        ["human", "{input}"],
    ]);
    const chain = prompt.pipe(model).pipe(parser);
    const result = await chain.invoke({ input: query, context: contextStr, query: query });
    if (!result) {
        logger.warn({ query }, "Query rewriter returned empty result");
        return null;
    }
    logger.debug({ original: query, rewritten: result }, "Query rewritten");
    return result;
}
