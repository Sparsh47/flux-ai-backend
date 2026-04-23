import fs from "fs"
import { runToolAgent } from "./tools.js"
import { ChatOllama } from "@langchain/ollama";
import { BASE_URL, MODEL } from "./constants.js";

const model = new ChatOllama({
    baseUrl: BASE_URL,
    model: MODEL,
    temperature: 0,
} as any);

interface Test {
    query: string;
    expected: string;
}

const tests: Test[] = JSON.parse(fs.readFileSync("eval.json", "utf8"));

let correct = 0;

for (const test of tests) {
    let output = "";
    const stream = runToolAgent(test.query, { messages: [], summary: "" });
    for await (const chunk of stream) {
        output += chunk;
    }

    const score = await evaluateAnswer(test.query, test.expected, output);

    if (score === 0) {
        console.log("FAILED:");
        console.log("Query:", test.query);
        console.log("Output:", output);
    }

    correct += score;
}

console.log("Accuracy:", correct / tests.length);

async function evaluateAnswer(query: string, expected: string, actual: string): Promise<number> {
    const prompt = `
You are an evaluator.

Check if the actual answer correctly answers the query.

Query: ${query}
Expected: ${expected}
Actual: ${actual}

Return ONLY a score:
- 1 = correct
- 0 = incorrect
`;

    const res: any = await (model as any).invoke(prompt);

    return Number((res.content as string).trim());
}