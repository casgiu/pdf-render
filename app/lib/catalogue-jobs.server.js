import fs from "fs";
import path from "path";
import os from "os";
import prisma from "../db.server";
import {
  listCollections,
  getProductsForCollection,
  stripHtml,
  truncateAtSentence,
  buildCharacteristics,
  MAIN_MENU_CATEGORIES,
} from "./shopify-data.server";
import crypto from "crypto";
import { downloadImage } from "./images.server";
import { generateCatalogPDF, generateFullCatalogPDF } from "./pdf.server";
import { generateFlipbook } from "./flipbook.server";

// Sur Render, CATALOGUE_STORAGE_DIR pointe vers le disque persistant (/data/catalogues)
// pour que les PDF survivent aux redémarrages/redéploiements. En local, on retombe
// sur un dossier temporaire.
const STORAGE_DIR = process.env.CATALOGUE_STORAGE_DIR || path.join(os.tmpdir(), "pdf-render-catalogues");
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function enrichProducts(products) {
  const enriched = [];
  for (const p of products) {
    const url = p.featuredMedia?.preview?.image?.url || null;
    const localImagePath = await downloadImage(url);
    enriched.push({
      title: p.title,
      descriptionPlain: truncateAtSentence(stripHtml(p.descriptionHtml), 80),
      priceRangeV2: p.priceRangeV2,
      variants: p.variants.edges.map((e) => e.node),
      characteristics: buildCharacteristics(p.metafields.edges.map((e) => e.node)),
      localImagePath,
    });
  }
  return enriched;
}

/** Crée un job "en attente" et retourne son id immédiatement (la génération se fait ailleurs, en tâche de fond). */
export async function createJob({ shop, type, label, collectionId }) {
  const job = await prisma.catalogueJob.create({
    data: { shop, type, label, collectionId, status: "pending" },
  });
  return job;
}

export async function getJob(id, shop) {
  return prisma.catalogueJob.findFirst({ where: { id, shop } });
}

export async function listRecentJobs(shop, limit = 15) {
  return prisma.catalogueJob.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Exécute réellement la génération et met à jour le job au fil de l'eau.
 * Conçue pour être appelée sans `await` (fire-and-forget) depuis la route
 * qui crée le job, afin de répondre immédiatement au navigateur.
 */
export async function runJob(jobId, admin) {
  await prisma.catalogueJob.update({ where: { id: jobId }, data: { status: "running" } });

  try {
    const job = await prisma.catalogueJob.findUniqueOrThrow({ where: { id: jobId } });
    const outputPath = path.join(STORAGE_DIR, `${jobId}.pdf`);

    let fileName;
    if (job.type === "full") {
      const collections = await listCollections(admin);
      const sections = [];

      for (const cat of MAIN_MENU_CATEGORIES) {
        const collection = collections.find((c) => c.handle === cat.handle);
        if (!collection) continue;

        const { collectionMeta, products } = await getProductsForCollection(admin, collection.id);
        const enriched = await enrichProducts(products);
        const image = await downloadImage(collectionMeta.image, 900, 82);
        sections.push({ title: cat.title, image, products: enriched });
      }

      const coverImagePath = sections.find((s) => s.image)?.image || null;
      await generateFullCatalogPDF({ outputPath, coverImagePath, sections });
      fileName = `catalogue-complet-${new Date().toISOString().slice(0, 10)}.pdf`;
    } else {
      const { collectionMeta, products } = await getProductsForCollection(admin, job.collectionId);
      const enriched = await enrichProducts(products);
      const coverImagePath = await downloadImage(collectionMeta.image, 900, 82);
      await generateCatalogPDF({ outputPath, collectionMeta, products: enriched, coverImagePath });
      fileName = `catalogue-${slugify(collectionMeta.title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    }

    await prisma.catalogueJob.update({
      where: { id: jobId },
      data: { status: "done", filePath: outputPath, fileName, completedAt: new Date() },
    });
  } catch (err) {
    console.error(`[catalogue-job ${jobId}] échec :`, err);
    await prisma.catalogueJob.update({
      where: { id: jobId },
      data: { status: "error", errorMessage: err.message?.slice(0, 500) || "Erreur inconnue", completedAt: new Date() },
    });
  }
}

/**
 * Lance la génération d'un flipbook à partir du PDF déjà produit par un job
 * terminé. Comme runJob, conçue pour être appelée sans `await`.
 */
export async function runFlipbookJob(jobId) {
  await prisma.catalogueJob.update({ where: { id: jobId }, data: { flipbookStatus: "running" } });

  try {
    const job = await prisma.catalogueJob.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status !== "done" || !job.filePath || !fs.existsSync(job.filePath)) {
      throw new Error("Le PDF de ce catalogue n'est pas disponible.");
    }

    const token = crypto.randomBytes(16).toString("hex");
    const outputHtmlPath = path.join(STORAGE_DIR, "flipbooks", `${token}.html`);
    await generateFlipbook(job.filePath, job.label, outputHtmlPath);

    await prisma.catalogueJob.update({
      where: { id: jobId },
      data: { flipbookStatus: "done", flipbookToken: token, flipbookPath: outputHtmlPath },
    });
  } catch (err) {
    console.error(`[flipbook-job ${jobId}] échec :`, err);
    await prisma.catalogueJob.update({
      where: { id: jobId },
      data: { flipbookStatus: "error", flipbookError: err.message?.slice(0, 500) || "Erreur inconnue" },
    });
  }
}

export async function getJobByFlipbookToken(token) {
  return prisma.catalogueJob.findUnique({ where: { flipbookToken: token } });
}
