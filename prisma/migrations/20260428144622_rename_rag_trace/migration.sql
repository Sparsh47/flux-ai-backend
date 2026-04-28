/*
  Warnings:

  - You are about to drop the `RAGTrace` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "RAGTrace";

-- CreateTable
CREATE TABLE "RagTrace" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "originalQuery" TEXT NOT NULL,
    "rewrittenQuery" TEXT,
    "cacheHit" BOOLEAN NOT NULL,
    "similarityScores" JSONB NOT NULL,
    "chunksReturned" INTEGER NOT NULL,
    "toolSelected" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RagTrace_id_key" ON "RagTrace"("id");
