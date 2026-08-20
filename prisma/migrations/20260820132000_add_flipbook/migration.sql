-- AlterTable
ALTER TABLE "CatalogueJob" ADD COLUMN "flipbookStatus" TEXT;
ALTER TABLE "CatalogueJob" ADD COLUMN "flipbookToken" TEXT;
ALTER TABLE "CatalogueJob" ADD COLUMN "flipbookPath" TEXT;
ALTER TABLE "CatalogueJob" ADD COLUMN "flipbookError" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueJob_flipbookToken_key" ON "CatalogueJob"("flipbookToken");
