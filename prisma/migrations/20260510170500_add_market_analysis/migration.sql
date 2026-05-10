CREATE TABLE IF NOT EXISTS "MarketCompetitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "address" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketCompetitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketOffer" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "currency" TEXT,
    "duration" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "location" TEXT,
    "schedule" TEXT,
    "groupSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "sourceUrl" TEXT,
    "confidence" DOUBLE PRECISION,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketOfferHistory" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketOfferHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketScan" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "MarketScan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketExtractedData" (
    "id" TEXT NOT NULL,
    "marketScanId" TEXT NOT NULL,
    "competitor" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "parsedData" JSONB,
    "confidence" DOUBLE PRECISION,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketExtractedData_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "competitor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MarketAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketCompetitor_website_idx" ON "MarketCompetitor"("website");
CREATE INDEX IF NOT EXISTS "MarketOffer_competitorId_domain_sourceUrl_idx" ON "MarketOffer"("competitorId", "domain", "sourceUrl");
CREATE INDEX IF NOT EXISTS "MarketAlert_createdAt_idx" ON "MarketAlert"("createdAt");
CREATE INDEX IF NOT EXISTS "MarketScan_startedAt_idx" ON "MarketScan"("startedAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MarketOffer_competitorId_fkey'
    ) THEN
        ALTER TABLE "MarketOffer"
        ADD CONSTRAINT "MarketOffer_competitorId_fkey"
        FOREIGN KEY ("competitorId") REFERENCES "MarketCompetitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MarketOfferHistory_offerId_fkey'
    ) THEN
        ALTER TABLE "MarketOfferHistory"
        ADD CONSTRAINT "MarketOfferHistory_offerId_fkey"
        FOREIGN KEY ("offerId") REFERENCES "MarketOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MarketExtractedData_marketScanId_fkey'
    ) THEN
        ALTER TABLE "MarketExtractedData"
        ADD CONSTRAINT "MarketExtractedData_marketScanId_fkey"
        FOREIGN KEY ("marketScanId") REFERENCES "MarketScan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
