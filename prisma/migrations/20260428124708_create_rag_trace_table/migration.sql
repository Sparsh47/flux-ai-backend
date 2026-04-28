-- CreateTable
CREATE TABLE "RAGTrace" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "originalQuery" TEXT NOT NULL,
    "rewrittenQuery" TEXT,
    "cacheHit" BOOLEAN NOT NULL,
    "similarityScores" JSONB NOT NULL,
    "chunksReturned" INTEGER NOT NULL,
    "toolSelected" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RAGTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RAGTrace_id_key" ON "RAGTrace"("id");
