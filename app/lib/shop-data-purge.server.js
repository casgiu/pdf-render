import prisma from "../db.server.js";
import { deleteObject } from "./object-storage.server.js";
import { removeCatalogueJobFromQueue } from "./job-queue.server.js";

/**
 * Erase every persisted resource for one shop. This is deliberately shared by
 * the compliance webhook and tests so data deletion is auditable.
 */
export async function purgeShopData(shop, dependencies = {}) {
  const db = dependencies.db || prisma;
  const removeObject = dependencies.deleteObject || deleteObject;
  const removeQueueJob = dependencies.removeQueueJob || removeCatalogueJobFromQueue;
  const jobs = await db.catalogueJob.findMany({
    where: { shop },
    select: { id: true, fileKey: true, flipbookKey: true },
  });

  await Promise.all(jobs.flatMap((job) => [
    removeObject(job.fileKey),
    removeObject(job.flipbookKey),
    removeQueueJob(job.id),
  ]));

  await db.$transaction([
    db.catalogueJob.deleteMany({ where: { shop } }),
    db.catalogueTheme.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
}
