ALTER TABLE "CatalogueJob" ADD COLUMN "flipbookPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CatalogueTheme" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
