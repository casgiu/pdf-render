-- CreateTable
CREATE TABLE "CatalogueTheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "backgroundColor" TEXT NOT NULL DEFAULT '#F5F1EA',
    "textColor" TEXT NOT NULL DEFAULT '#3B2E24',
    "accentColor" TEXT NOT NULL DEFAULT '#B08D57',
    "mutedColor" TEXT NOT NULL DEFAULT '#8A7B6C',
    "lineColor" TEXT NOT NULL DEFAULT '#D8CFC0',
    "fontFamily" TEXT NOT NULL DEFAULT 'helvetica',
    "tagline" TEXT NOT NULL DEFAULT 'Mobilier & décoration haut de gamme',
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueTheme_shop_key" ON "CatalogueTheme"("shop");
