CREATE TABLE "KnowledgeBaseEntry" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requestType" TEXT,
  "sourceTaskId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeBaseEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeBaseEntry_category_idx" ON "KnowledgeBaseEntry"("category");
CREATE INDEX "KnowledgeBaseEntry_requestType_idx" ON "KnowledgeBaseEntry"("requestType");
CREATE INDEX "KnowledgeBaseEntry_active_idx" ON "KnowledgeBaseEntry"("active");
