-- Les chemins locaux restent temporairement afin que les catalogues existants
-- restent téléchargeables pendant la migration vers Cloudflare R2.
ALTER TABLE "CatalogueJob" ADD COLUMN "fileKey" TEXT;
ALTER TABLE "CatalogueJob" ADD COLUMN "flipbookKey" TEXT;
