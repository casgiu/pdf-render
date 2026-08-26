import fs from "fs";
import path from "path";
import os from "os";
import prisma from "../db.server.js";
import {
  listCollections,
  getMenuCollections,
  getProductsForCollection,
  stripHtml,
  truncateAtSentence,
  buildCharacteristics,
  MAIN_MENU_CATEGORIES,
} from "./shopify-data.server.js";
import crypto from "crypto";
import { downloadImage } from "./images.server.js";
import { generateCatalogPDF, generateFullCatalogPDF } from "./pdf.server.js";
import { generateFlipbook } from "./flipbook.server.js";
import { getTheme, FONT_FAMILIES } from "./theme.server.js";
import { downloadObjectToFile, uploadFile } from "./object-storage.server.js";

/** Réglages de thème (couleurs, accroche) + police résolue depuis sa clé, prêts pour pdf.server.js. */
async function resolvePdfTheme(shop) {
  const theme = await getTheme(shop);
  const fonts = FONT_FAMILIES[theme.fontFamily] || FONT_FAMILIES.helvetica;
  const logoPath = await downloadImage(theme.logoUrl, 500, 90);
  return { ...theme, fonts, logoPath };
}

// R2 est la source de vérité. Le disque local ne sert plus qu'aux fichiers
// temporaires nécessaires à pdfkit et pdftoppm.
const STORAGE_DIR = path.join(os.tmpdir(), "pdf-render-catalogues");
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
 * Exécutée par le worker BullMQ. En cas d'erreur, elle met à jour le statut
 * puis relance l'erreur afin que BullMQ puisse réessayer le job.
 */
export async function runJob(jobId, admin) {
  await prisma.catalogueJob.update({ where: { id: jobId }, data: { status: "running" } });

  try {
    const job = await prisma.catalogueJob.findUniqueOrThrow({ where: { id: jobId } });
    const outputPath = path.join(STORAGE_DIR, `${jobId}.pdf`);
    const theme = await resolvePdfTheme(job.shop);

    let fileName;
    if (job.type === "full") {
      const collections = await listCollections(admin);
      const sections = [];

      // Une boutique universelle choisit son menu dans les réglages. On garde
      // la liste Homa historique comme repli pour les boutiques déjà actives.
      const menuCategories = await getMenuCollections(admin, theme.mainMenuHandle);
      const categories = menuCategories.length > 0
        ? menuCategories
        : MAIN_MENU_CATEGORIES.map((category) => ({
          title: category.title,
          id: collections.find((collection) => collection.handle === category.handle)?.id,
        })).filter((category) => category.id);

      for (const cat of categories) {
        const collection = collections.find((c) => c.id === cat.id);
        if (!collection) continue;

        const { collectionMeta, products } = await getProductsForCollection(admin, collection.id);
        const enriched = await enrichProducts(products);
        const image = await downloadImage(collectionMeta.image, 900, 82);
        sections.push({ title: cat.title, image, products: enriched });
      }

      const coverImagePath = sections.find((s) => s.image)?.image || null;
      await generateFullCatalogPDF({ outputPath, coverImagePath, sections, theme });
      fileName = `catalogue-complet-${new Date().toISOString().slice(0, 10)}.pdf`;
    } else {
      const { collectionMeta, products } = await getProductsForCollection(admin, job.collectionId);
      const enriched = await enrichProducts(products);
      const coverImagePath = await downloadImage(collectionMeta.image, 900, 82);
      await generateCatalogPDF({ outputPath, collectionMeta, products: enriched, coverImagePath, theme });
      fileName = `catalogue-${slugify(collectionMeta.title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    }

    const fileKey = `catalogues/${job.shop}/${jobId}.pdf`;
    await uploadFile(fileKey, outputPath, "application/pdf");
    await prisma.catalogueJob.update({
      where: { id: jobId },
      data: { status: "done", fileKey, filePath: null, fileName, completedAt: new Date() },
    });
    await fs.promises.rm(outputPath, { force: true }).catch((cleanupError) => {
      console.warn(`[catalogue-job ${jobId}] nettoyage du PDF temporaire impossible :`, cleanupError);
    });
  } catch (err) {
    console.error(`[catalogue-job ${jobId}] échec :`, err);
    await prisma.catalogueJob.update({
      where: { id: jobId },
      data: { status: "error", errorMessage: err.message?.slice(0, 500) || "Erreur inconnue", completedAt: new Date() },
    });
    throw err;
  }
}

/**
 * Lance la génération d'un flipbook à partir du PDF déjà produit par un job
 * terminé. Elle est exécutée et relancée par le worker BullMQ.
 */
export async function runFlipbookJob(jobId) {
  await prisma.catalogueJob.update({ where: { id: jobId }, data: { flipbookStatus: "running" } });

  try {
    const job = await prisma.catalogueJob.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status !== "done" || (!job.fileKey && (!job.filePath || !fs.existsSync(job.filePath)))) {
      throw new Error("Le PDF de ce catalogue n'est pas disponible.");
    }

    const token = crypto.randomBytes(16).toString("hex");
    const localPdfPath = job.fileKey
      ? path.join(STORAGE_DIR, `${jobId}-flipbook.pdf`)
      : job.filePath;
    const outputHtmlPath = path.join(STORAGE_DIR, "flipbooks", `${token}.html`);
    if (job.fileKey) await downloadObjectToFile(job.fileKey, localPdfPath);
    await generateFlipbook(localPdfPath, job.label, outputHtmlPath);
    const flipbookKey = `flipbooks/${job.shop}/${token}.html`;
    await uploadFile(flipbookKey, outputHtmlPath, "text/html; charset=utf-8");

    await prisma.catalogueJob.update({
      where: { id: jobId },
      data: { flipbookStatus: "done", flipbookToken: token, flipbookKey, flipbookPath: null },
    });
    if (job.fileKey) {
      await fs.promises.rm(localPdfPath, { force: true }).catch((cleanupError) => {
        console.warn(`[flipbook-job ${jobId}] nettoyage du PDF temporaire impossible :`, cleanupError);
      });
    }
    await fs.promises.rm(outputHtmlPath, { force: true }).catch((cleanupError) => {
      console.warn(`[flipbook-job ${jobId}] nettoyage du HTML temporaire impossible :`, cleanupError);
    });
  } catch (err) {
    console.error(`[flipbook-job ${jobId}] échec :`, err);
    await prisma.catalogueJob.update({
      where: { id: jobId },
      data: { flipbookStatus: "error", flipbookError: err.message?.slice(0, 500) || "Erreur inconnue" },
    });
    throw err;
  }
}

export async function getJobByFlipbookToken(token) {
  return prisma.catalogueJob.findUnique({ where: { flipbookToken: token } });
}
