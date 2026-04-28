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
        // Extract usage metadata from LangChain response
        const usage = response.usage_metadata || response.response_metadata?.usage || {};
        
        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;
        const totalTokens = usage.total_tokens || (promptTokens + completionTokens);

        // If we couldn't get tokens from metadata, try fallback to estimation or log warning
        if (totalTokens === 0) {
            logger.debug({ tool, sessionId }, "No token usage metadata found in LLM response");
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
