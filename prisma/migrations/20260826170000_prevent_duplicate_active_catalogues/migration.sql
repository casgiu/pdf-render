-- Une boutique ne peut traiter qu'un seul catalogue actif à la fois pour une
-- même collection, et un seul catalogue complet. Les anciens catalogues sont
-- supprimés par le worker lorsque la nouvelle génération réussit.
CREATE UNIQUE INDEX "CatalogueJob_one_active_per_scope"
ON "CatalogueJob" ("shop", "type", COALESCE("collectionId", ''))
WHERE "status" IN ('pending', 'running');
