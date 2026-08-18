import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { authenticate } from "../shopify.server";
import {
  listCollections,
  getProductsForCollection,
  stripHtml,
  truncateAtSentence,
  buildCharacteristics,
  MAIN_MENU_CATEGORIES,
} from "../lib/shopify-data.server";
import { downloadImage } from "../lib/images.server";
import { generateCatalogPDF, generateFullCatalogPDF } from "../lib/pdf.server";

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

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  const tmpFile = path.join(os.tmpdir(), `catalogue-${crypto.randomUUID()}.pdf`);

  try {
    let fileName;

    if (type === "full") {
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
      await generateFullCatalogPDF({ outputPath: tmpFile, coverImagePath, sections });
      fileName = `catalogue-complet-${new Date().toISOString().slice(0, 10)}.pdf`;
    } else {
      const collectionId = url.searchParams.get("collection");
      if (!collectionId) {
        throw new Response("Paramètre 'collection' manquant.", { status: 400 });
      }

      const { collectionMeta, products } = await getProductsForCollection(admin, collectionId);
      const enriched = await enrichProducts(products);
      const coverImagePath = await downloadImage(collectionMeta.image, 900, 82);
      await generateCatalogPDF({ outputPath: tmpFile, collectionMeta, products: enriched, coverImagePath });
      fileName = `catalogue-${slugify(collectionMeta.title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
    }

    const buffer = fs.readFileSync(tmpFile);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
};
