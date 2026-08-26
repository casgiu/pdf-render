import prisma from "../db.server.js";
import { deleteObjects, listObjects } from "./object-storage.server.js";

const OBJECT_PREFIXES = ["catalogues/", "flipbooks/"];
const DEFAULT_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

/**
 * Supprime les objets R2 qui ne sont plus référencés par un CatalogueJob.
 * Le délai de grâce protège les objets récemment créés si le processus tombe
 * entre l'upload et l'écriture de leur clé dans PostgreSQL.
 */
export async function reconcileObjectStorage({
  dryRun = false,
  now = new Date(),
  gracePeriodMs = Number(process.env.OBJECT_STORAGE_ORPHAN_GRACE_PERIOD_MS) || DEFAULT_GRACE_PERIOD_MS,
  db = prisma,
  getObjects = listObjects,
  removeObjects = deleteObjects,
} = {}) {
  const jobs = await db.catalogueJob.findMany({
    select: { fileKey: true, flipbookKey: true },
  });
  const referencedKeys = new Set(
    jobs.flatMap(({ fileKey, flipbookKey }) => [fileKey, flipbookKey].filter(Boolean)),
  );
  const objects = (await Promise.all(OBJECT_PREFIXES.map(getObjects))).flat();
  const orphanedKeys = objects
    .filter(({ Key, LastModified }) => (
      Key
      && !referencedKeys.has(Key)
      && LastModified
      && now.getTime() - LastModified.getTime() >= gracePeriodMs
    ))
    .map(({ Key }) => Key);

  if (!dryRun && orphanedKeys.length > 0) await removeObjects(orphanedKeys);

  return {
    dryRun,
    referencedCount: referencedKeys.size,
    scannedCount: objects.length,
    orphanedKeys,
    deletedCount: dryRun ? 0 : orphanedKeys.length,
  };
}
