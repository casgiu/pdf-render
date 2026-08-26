-- CreateTable
CREATE TABLE "CatalogueJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "collectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fileName" TEXT,
    "filePath" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3)
);

-- CreateIndex
CREATE INDEX "CatalogueJob_shop_createdAt_idx" ON "CatalogueJob"("shop", "createdAt");
