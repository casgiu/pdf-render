import test from "node:test";
import assert from "node:assert/strict";
import { isOnboardingComplete } from "../app/lib/theme.server.js";
import { isFlipbookPublic } from "../app/lib/catalogue-jobs.server.js";
import { purgeShopData } from "../app/lib/shop-data-purge.server.js";
import { parseCatalogueJobInput } from "../app/lib/job-input.server.js";
import { escapeHtml } from "../app/lib/flipbook.server.js";

test("l’onboarding exige une marque et un menu", () => {
  assert.equal(isOnboardingComplete({ brandName: "Atelier", mainMenuHandle: "principal" }), true);
  assert.equal(isOnboardingComplete({ brandName: "Atelier", mainMenuHandle: "" }), false);
});

test("un flipbook révoqué n’est jamais public", () => {
  assert.equal(isFlipbookPublic({ flipbookStatus: "done", flipbookPublished: true }), true);
  assert.equal(isFlipbookPublic({ flipbookStatus: "done", flipbookPublished: false }), false);
});

test("le titre du flipbook est échappé avant insertion dans le HTML", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("la création de catalogue refuse les données incohérentes", () => {
  const formData = (entries) => {
    const data = new FormData();
    entries.forEach(([key, value]) => data.append(key, value));
    return data;
  };

  assert.deepEqual(parseCatalogueJobInput(formData([["type", "unknown"]])), {
    error: "Le type de catalogue est invalide.",
  });
  assert.deepEqual(parseCatalogueJobInput(formData([["type", "collection"]])), {
    error: "Une collection est requise.",
  });
  assert.deepEqual(parseCatalogueJobInput(formData([["type", "full"], ["label", "  Mon catalogue  "]])), {
    type: "full",
    collectionId: null,
    label: "Mon catalogue",
  });
});

test("l’effacement boutique retire les objets, tâches et lignes persistées", async () => {
  const removedObjects = [];
  const removedQueueJobs = [];
  const deleted = [];
  const db = {
    catalogueJob: {
      findMany: async () => [{ id: "job-1", fileKey: "catalogues/shop/job-1.pdf", flipbookKey: "flipbooks/shop/token.html" }],
      deleteMany: (args) => { deleted.push(["jobs", args]); return Promise.resolve(); },
    },
    catalogueTheme: { deleteMany: (args) => { deleted.push(["theme", args]); return Promise.resolve(); } },
    session: { deleteMany: (args) => { deleted.push(["session", args]); return Promise.resolve(); } },
    $transaction: async (operations) => Promise.all(operations),
  };

  await purgeShopData("shop.myshopify.com", {
    db,
    deleteObject: async (key) => removedObjects.push(key),
    removeQueueJob: async (id) => removedQueueJobs.push(id),
  });

  assert.deepEqual(removedObjects, ["catalogues/shop/job-1.pdf", "flipbooks/shop/token.html"]);
  assert.deepEqual(removedQueueJobs, ["job-1"]);
  assert.equal(deleted.length, 3);
});
