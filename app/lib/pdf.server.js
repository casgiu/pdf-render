import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// pdf.server.js vit dans app/lib/ ; le logo est à la racine du projet dans assets/.
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo.png');
const LOGO_ASPECT_RATIO = 1086 / 1448; // hauteur / largeur du logo source

const COLORS = {
  cream: '#F5F1EA',
  taupe: '#8A7B6C',
  darkBrown: '#3B2E24',
  gold: '#B08D57',
  lightLine: '#D8CFC0',
  white: '#FFFFFF',
  stockOk: '#3B2E24',
  stockOut: '#B0473E',
};

const DELAY_MSG = 'En commande sous 20 à 24 semaines';

function priceStr(amount, currency = 'EUR') {
  const symbol = currency === 'EUR' ? '€' : currency;
  const n = Number(amount);
  const [intPart, decPart] = n.toFixed(2).split('.');
  // Séparateur de milliers avec un espace normal (évite l'espace insécable mal rendu par certaines polices PDF)
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withThousands},${decPart} ${symbol}`;
}

function drawImageOrPlaceholder(doc, imgPath, x, y, w, h) {
  if (imgPath && fs.existsSync(imgPath)) {
    try {
      const img = doc.openImage(imgPath);
      // On calcule la taille réelle d'affichage (comme "fit") pour que le
      // cadre épouse l'image et non toute la boîte (sinon marges blanches encadrées).
      const scale = Math.min(w / img.width, h / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = x + (w - drawW) / 2;
      const drawY = y + (h - drawH) / 2;
      doc.image(img, drawX, drawY, { width: drawW, height: drawH });
      doc.rect(drawX, drawY, drawW, drawH).lineWidth(1.5).stroke('#1A1512');
      return;
    } catch (e) {
      // fall through to placeholder if the image is unreadable
    }
  }
  // Placeholder vectoriel
  doc.save();
  doc.rect(x, y, w, h).fill(COLORS.cream);
  doc.rect(x, y, w, h).lineWidth(1.5).stroke('#1A1512');
  doc.fontSize(9).fillColor(COLORS.taupe)
    .text('Photo produit indisponible', x, y + h / 2 - 5, { width: w, align: 'center' });
  doc.restore();
}

function drawCoverPage(doc, { title, subtitle, coverImagePath }) {
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;

  doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.cream);

  // Logo en haut de la page (le mot-symbole "Homa Home" est déjà intégré à l'image).
  const logoW = 170;
  const logoH = logoW * LOGO_ASPECT_RATIO;
  const logoY = 40;
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, (PAGE_W - logoW) / 2, logoY, { width: logoW });
  }

  const imgX = 40, imgY = logoY + logoH + 25, imgW = PAGE_W - 80, imgH = 290;
  drawImageOrPlaceholder(doc, coverImagePath, imgX, imgY, imgW, imgH);

  doc.fontSize(14).fillColor(COLORS.gold).font('Helvetica-Oblique')
    .text('Mobilier & décoration haut de gamme', 0, imgY + imgH + 65, { align: 'center' });

  doc.fontSize(16).fillColor(COLORS.darkBrown).font('Helvetica')
    .text(title, 0, PAGE_H - 120, { align: 'center' });
  if (subtitle) {
    doc.fontSize(12).fillColor(COLORS.taupe).font('Helvetica')
      .text(subtitle, 0, PAGE_H - 95, { align: 'center' });
  }
}

function drawPresentationPage(doc, presentationText) {
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;

  doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.white);
  const margin = 70;
  let y = 100;

  doc.fontSize(22).fillColor(COLORS.darkBrown).font('Helvetica-Bold')
    .text('Bienvenue chez Homa Home', margin, y);
  y += 40;
  doc.moveTo(margin, y).lineTo(margin + 130, y).lineWidth(1.2).stroke(COLORS.gold);
  y += 30;

  doc.fontSize(13).fillColor(COLORS.darkBrown).font('Helvetica')
    .text(presentationText, margin, y, { width: PAGE_W - margin * 2, lineGap: 4 });
}

/** Page de séparation entre deux catégories, dans le catalogue complet. */
function drawCategoryDividerPage(doc, categoryTitle, imagePath) {
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;

  doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.cream);

  const imgX = 60, imgY = 140, imgW = PAGE_W - 120, imgH = 340;
  drawImageOrPlaceholder(doc, imagePath, imgX, imgY, imgW, imgH);

  doc.moveTo(PAGE_W / 2 - 65, imgY + imgH + 35).lineTo(PAGE_W / 2 + 65, imgY + imgH + 35)
    .lineWidth(1.2).stroke(COLORS.gold);

  doc.fontSize(30).fillColor(COLORS.darkBrown).font('Helvetica-Bold')
    .text(categoryTitle, 0, imgY + imgH + 55, { align: 'center' });
}

function footerText(collectionLabel) {
  return `Homa Home — Catalogue ${collectionLabel}`;
}

/** Dessine les fiches produits (2 par page) pour une liste de produits, avec footer. */
function drawProductPages(doc, products, footerLabel, pageNumRef) {
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;

  const pMargin = 55;
  const cardGap = 25;
  const cardH = (PAGE_H - pMargin * 2 - cardGap) / 2;
  const imgWCard = 200;
  const contentX = pMargin + imgWCard + 30;
  const contentW = PAGE_W - contentX - pMargin;

  function drawCard(p, topY) {
    const bottomY = topY + cardH;
    drawImageOrPlaceholder(doc, p.localImagePath, pMargin, topY, imgWCard, cardH - 10);

    const totalStock = p.variants.reduce((sum, v) => sum + Math.max(v.inventoryQuantity, 0), 0);
    const outOfStock = totalStock === 0;

    let ty = topY;
    doc.fontSize(12.5).fillColor(COLORS.darkBrown).font('Helvetica-Bold')
      .text(p.title, contentX, ty, { width: contentW });
    ty = doc.y + 4;

    const price = p.priceRangeV2?.minVariantPrice;
    doc.fontSize(11.5).fillColor(COLORS.gold).font('Helvetica-Bold')
      .text(priceStr(price.amount, price.currencyCode), contentX, ty);
    ty = doc.y + 3;

    // Le délai de fabrication ne s'affiche que pour les pièces en rupture
    // (les articles en stock partent plus vite ; le stock lui-même n'est
    // volontairement pas affiché car il change en permanence).
    if (outOfStock) {
      doc.fontSize(9).fillColor(COLORS.taupe).font('Helvetica-Oblique')
        .text(DELAY_MSG, contentX, ty);
      ty = doc.y + 5;
    } else {
      ty += 2;
    }

    // Description affichée en entier (pas de troncature) : on mesure sa hauteur
    // réelle pour positionner correctement le bloc suivant.
    doc.fontSize(9.5).fillColor(COLORS.darkBrown).font('Helvetica');
    const descHeight = doc.heightOfString(p.descriptionPlain, { width: contentW, lineGap: 3 });
    doc.text(p.descriptionPlain, contentX, ty, { width: contentW, lineGap: 3 });
    ty = ty + descHeight + 10;

    // Caractéristiques (dimensions, poids, couleur) issues des metafields produit,
    // affichées en une ligne compacte séparée par des puces.
    if (p.characteristics && p.characteristics.length > 0) {
      const charsLine = p.characteristics.map(c => `${c.label} : ${c.value}`).join('   •   ');
      doc.fontSize(7.5).fillColor(COLORS.taupe).font('Helvetica');
      const charsHeight = doc.heightOfString(charsLine, { width: contentW, lineGap: 2 });
      doc.text(charsLine, contentX, ty, { width: contentW, lineGap: 2 });
      ty = ty + charsHeight + 10;
    }

    // La liste "Dimensions disponibles" n'a de sens que s'il y a plusieurs
    // déclinaisons à comparer ; avec une seule variante, le prix déjà affiché
    // en haut de la fiche suffit.
    const singleVariant = p.variants.length === 1;
    if (!singleVariant) {
      doc.fontSize(9).fillColor(COLORS.darkBrown).font('Helvetica-Bold')
        .text('Dimensions disponibles', contentX, ty);
      ty = doc.y + 5;

      doc.fontSize(9).font('Helvetica');
      const col2 = contentX + contentW * 0.5;
      for (const v of p.variants.slice(0, 4)) {
        doc.fillColor(COLORS.darkBrown).text(`• ${v.title}`, contentX, ty, { continued: false });
        doc.fillColor(COLORS.darkBrown).text(priceStr(v.price), col2, ty);
        ty += 14;
      }
    }

    doc.moveTo(pMargin, bottomY).lineTo(PAGE_W - pMargin, bottomY).lineWidth(0.5).stroke(COLORS.lightLine);
  }

  for (let i = 0; i < products.length; i += 2) {
    doc.addPage();
    doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.white);

    drawCard(products[i], pMargin);
    if (products[i + 1]) drawCard(products[i + 1], pMargin + cardH + cardGap);

    doc.fontSize(9).fillColor(COLORS.taupe).font('Helvetica')
      .text(`${footerText(footerLabel)} — page ${pageNumRef.n}`, 0, PAGE_H - 30, { align: 'center' });
    pageNumRef.n++;
  }
}

/**
 * Génère le PDF du catalogue pour une collection donnée.
 * @param {object} opts
 * @param {string} opts.outputPath
 * @param {{title:string, image:string|null}} opts.collectionMeta
 * @param {Array} opts.products - [{title, descriptionHtml, priceRangeV2, variants, localImagePath}]
 * @param {string|null} opts.coverImagePath - chemin local de l'image de couverture (optionnel)
 */
export function generateCatalogPDF({ outputPath, collectionMeta, products, coverImagePath }) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outputPath);
  const finished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  doc.pipe(stream);

  drawCoverPage(doc, { title: `Catalogue — ${collectionMeta.title}`, coverImagePath });
  doc.addPage();

  const presentationText =
    "Homa Home est une maison de mobilier et de décoration haut de gamme, fabriquée en bois massif. " +
    "Nous proposons une sélection soignée de meubles, canapés, tables, buffets et chaises, pensés pour sublimer chaque intérieur.\n\n" +
    `Chaque pièce de notre catalogue est fabriquée sur commande (${DELAY_MSG.toLowerCase()}), garantissant ` +
    "un savoir-faire artisanal et une qualité durable. Nous livrons en Corse, en France et en Europe.\n\n" +
    `Ce catalogue présente notre sélection ${collectionMeta.title.toLowerCase()}. Chaque fiche produit détaille ` +
    "le prix et les dimensions disponibles.";
  drawPresentationPage(doc, presentationText);

  drawProductPages(doc, products, collectionMeta.title, { n: 1 });

  doc.end();
  return finished;
}

/**
 * Génère un catalogue complet regroupant plusieurs catégories, chacune précédée
 * d'une page de séparation.
 * @param {object} opts
 * @param {string} opts.outputPath
 * @param {string|null} opts.coverImagePath
 * @param {Array<{title:string, image:string|null, products:Array}>} opts.sections
 */
export function generateFullCatalogPDF({ outputPath, coverImagePath, sections }) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outputPath);
  const finished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  doc.pipe(stream);

  drawCoverPage(doc, {
    title: 'Catalogue complet',
    subtitle: sections.map(s => s.title).join(' · '),
    coverImagePath,
  });
  doc.addPage();

  const presentationText =
    "Homa Home est une maison de mobilier et de décoration haut de gamme, fabriquée en bois massif. " +
    "Nous proposons une sélection soignée de meubles, canapés, tables, buffets et chaises, pensés pour sublimer chaque intérieur.\n\n" +
    `Chaque pièce de notre catalogue est fabriquée sur commande (${DELAY_MSG.toLowerCase()}), garantissant ` +
    "un savoir-faire artisanal et une qualité durable. Nous livrons en Corse, en France et en Europe.\n\n" +
    "Ce catalogue présente l'ensemble de notre collection, organisée par catégorie. Chaque fiche produit " +
    "détaille le prix et les dimensions disponibles.";
  drawPresentationPage(doc, presentationText);

  const pageNumRef = { n: 1 };
  for (const section of sections) {
    if (section.products.length === 0) continue;
    doc.addPage();
    drawCategoryDividerPage(doc, section.title, section.image);
    drawProductPages(doc, section.products, section.title, pageNumRef);
  }

  doc.end();
  return finished;
}
