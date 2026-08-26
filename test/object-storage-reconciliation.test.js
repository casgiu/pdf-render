import assert from "node:assert/strict";
import test from "node:test";
import { reconcileObjectStorage } from "../app/lib/object-storage-reconciliation.server.js";

test("reconcileObjectStorage supprime uniquement les objets orphelins hors délai de grâce", async () => {
  const deleted = [];
  const result = await reconcileObjectStorage({
    now: new Date("2026-08-26T12:00:00Z"),
    gracePeriodMs: 60 * 60 * 1000,
    db: {
      catalogueJob: {
        findMany: async () => [{ fileKey: "catalogues/shop/kept.pdf", flipbookKey: null }],
      },
    },
    getObjects: async (prefix) => prefix === "catalogues/"
      ? [
        { Key: "catalogues/shop/kept.pdf", LastModified: new Date("2026-08-20T12:00:00Z") },
        { Key: "catalogues/shop/orphan.pdf", LastModified: new Date("2026-08-20T12:00:00Z") },
        { Key: "catalogues/shop/recent.pdf", LastModified: new Date("2026-08-26T11:30:00Z") },
      ]
      : [{ Key: "flipbooks/shop/orphan.html", LastModified: new Date("2026-08-20T12:00:00Z") }],
    removeObjects: async (keys) => deleted.push(...keys),
  });

  assert.deepEqual(deleted, ["catalogues/shop/orphan.pdf", "flipbooks/shop/orphan.html"]);
  assert.deepEqual(result.orphanedKeys, deleted);
  assert.equal(result.scannedCount, 4);
});

test("reconcileObjectStorage ne supprime rien en mode simulation", async () => {
  const deleted = [];
  const result = await reconcileObjectStorage({
    dryRun: true,
    now: new Date("2026-08-26T12:00:00Z"),
    gracePeriodMs: 0,
    db: { catalogueJob: { findMany: async () => [] } },
    getObjects: async (prefix) => prefix === "catalogues/"
      ? [{ Key: "catalogues/shop/orphan.pdf", LastModified: new Date("2026-08-20T12:00:00Z") }]
      : [],
    removeObjects: async (keys) => deleted.push(...keys),
  });

  assert.deepEqual(deleted, []);
  assert.equal(result.deletedCount, 0);
  assert.deepEqual(result.orphanedKeys, ["catalogues/shop/orphan.pdf"]);
});
