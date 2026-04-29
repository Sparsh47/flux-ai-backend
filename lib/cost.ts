import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import { BaseMessage } from "@langchain/core/messages";
import { Tool } from "@prisma/client";

export async function trackLLMCost(
    sessionId: string,
    tool: Tool,
    modelName: string,
    response: BaseMessage | any,
    latencyMs: number
) {
    try {
        // Extract usage metadata — LangChain's usage_metadata uses input_tokens/output_tokens
        // (Ollama, Google, Anthropic), while OpenAI uses prompt_tokens/completion_tokens.
        // Support both conventions.
        const usage = response.usage_metadata || response.response_metadata?.usage || {};

        const promptTokens =
            usage.input_tokens ??
            usage.prompt_tokens ??
            usage.inputTokens ??
            0;
        const completionTokens =
            usage.output_tokens ??
            usage.completion_tokens ??
            usage.outputTokens ??
            0;
        const totalTokens =
            usage.total_tokens ??
            usage.totalTokens ??
            (promptTokens + completionTokens);

        if (totalTokens === 0) {
            logger.debug({ tool, sessionId, usageKeys: Object.keys(usage) }, "No token usage metadata found in LLM response");
        }

        await prisma.lLMCost.create({
            data: {
                sessionId,
                tool,
                model: modelName,
                promptTokens,
                completionTokens,
                totalTokens,
                latencyMs: Math.round(latencyMs),
            },
        });

        logger.debug({ 
            sessionId, 
            tool, 
            tokens: totalTokens, 
            latency: latencyMs 
        }, "LLM cost tracked successfully");

    } catch (error) {
        logger.error({ error, sessionId, tool }, "Failed to track LLM cost");
    }
}
