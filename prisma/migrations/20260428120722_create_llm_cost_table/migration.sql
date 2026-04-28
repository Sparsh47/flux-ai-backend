-- CreateEnum
CREATE TYPE "Tool" AS ENUM ('REWRITE', 'AGENT', 'SUMMARY', 'FALLBACK');

-- CreateTable
CREATE TABLE "LLMCost" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tool" "Tool" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LLMCost_id_key" ON "LLMCost"("id");
