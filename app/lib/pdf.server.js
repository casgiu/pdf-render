import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// pdf.server.js vit dans app/lib/ ; le logo est à la racine du projet dans assets/.
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo.png');
const LOGO_ASPECT_RATIO = 1086 / 1448; // hauteur / largeur du logo source

const DEFAULT_COLORS = {
  cream: '#F5F1EA',
  taupe: '#8A7B6C',
  darkBrown: '#3B2E24',
  gold: '#B08D57',
  lightLine: '#D8CFC0',
  white: '#FFFFFF',
};

const DEFAULT_FONTS = { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' };
const DEFAULT_TAGLINE = 'Mobilier & décoration haut de gamme';

/** Construit les palettes couleurs/polices utilisées par les fonctions de dessin à partir du thème choisi dans l'app (avec les valeurs actuelles comme repli). */
function resolveTheme(theme) {
  return {
    colors: {
      cream: theme?.backgroundColor || DEFAULT_COLORS.cream,
      darkBrown: theme?.textColor || DEFAULT_COLORS.darkBrown,
      gold: theme?.accentColor || DEFAULT_COLORS.gold,
      taupe: theme?.mutedColor || DEFAULT_COLORS.taupe,
      lightLine: theme?.lineColor || DEFAULT_COLORS.lightLine,
      white: DEFAULT_COLORS.white,
    },
    headingFonts: theme?.headingFonts || theme?.fonts || DEFAULT_FONTS,
    bodyFonts: theme?.bodyFonts || theme?.fonts || DEFAULT_FONTS,
    tagline: theme?.tagline || DEFAULT_TAGLINE,
    presentationText: theme?.presentationText?.trim() || '',
  };
}

function defaultPresentationText({ brandName, collectionTitle }) {
  const collectionSentence = collectionTitle
    ? `Ce catalogue présente notre sélection ${collectionTitle.toLowerCase()}.`
    : "Ce catalogue présente l'ensemble de notre collection, organisée par catégorie.";
  return `${brandName} est une maison de mobilier et de décoration haut de gamme, fabriquée en bois massif. ` +
    "Nous proposons une sélection soignée de meubles, canapés, tables, buffets et chaises, pensés pour sublimer chaque intérieur.\n\n" +
    `Chaque pièce de notre catalogue est fabriquée sur commande (${DELAY_MSG.toLowerCase()}), garantissant ` +
    "un savoir-faire artisanal et une qualité durable. Nous livrons en Corse, en France et en Europe.\n\n" +
    `${collectionSentence} Chaque fiche produit détaille le prix et les dimensions disponibles.`;
}

function presentationTextFor(theme, context) {
  return theme.presentationText || defaultPresentationText(context);
}

const DELAY_MSG = 'En commande sous 20 à 24 semaines';

function priceStr(amount, currency = 'EUR') {
  const symbol = currency === 'EUR' ? '€' : currency;
  const n = Number(amount);
  const [intPart, decPart] = n.toFixed(2).split('.');
  // Séparateur de milliers avec un espace normal (évite l'espace insécable mal rendu par certaines polices PDF)
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withThousands},${decPart} ${symbol}`;
}

function drawImageOrPlaceholder(doc, colors, imgPath, x, y, w, h) {
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
  doc.rect(x, y, w, h).fill(colors.cream);
  doc.rect(x, y, w, h).lineWidth(1.5).stroke('#1A1512');
  doc.fontSize(9).fillColor(colors.taupe)
    .text('Photo produit indisponible', x, y + h / 2 - 5, { width: w, align: 'center' });
  doc.restore();
}

function drawCoverPage(doc, { colors, headingFonts, bodyFonts, tagline, logoPath, brandName }, { title, subtitle, coverImagePath }) {
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;

  doc.rect(0, 0, PAGE_W, PAGE_H).fill(colors.cream);

  // Logo en haut de la page (le mot-symbole "Homa Home" est déjà intégré à l'image).
  const logoW = 170;
  const logoH = logoW * LOGO_ASPECT_RATIO;
  const logoY = 40;
  const resolvedLogoPath = logoPath && fs.existsSync(logoPath) ? logoPath : !brandName ? LOGO_PATH : null;
  if (resolvedLogoPath && fs.existsSync(resolvedLogoPath)) {
    doc.image(resolvedLogoPath, (PAGE_W - logoW) / 2, logoY, { width: logoW });
  } else if (brandName) {
    doc.fontSize(24).fillColor(colors.darkBrown).font(headingFonts.bold)
      .text(brandName, 0, logoY + 20, { align: "center" });
  }

  const imgX = 40, imgY = logoY + logoH + 25, imgW = PAGE_W - 80, imgH = 290;
  drawImageOrPlaceholder(doc, colors, coverImagePath, imgX, imgY, imgW, imgH);

  doc.fontSize(14).fillColor(colors.gold).font(bodyFonts.italic)
    .text(tagline, 0, imgY + imgH + 65, { align: 'center' });

  doc.fontSize(16).fillColor(colors.darkBrown).font(headingFonts.regular)
    .text(title, 0, PAGE_H - 120, { align: 'center' });
  if (subtitle) {
    doc.fontSize(12).fillColor(colors.taupe).font(bodyFonts.regular)
      .text(subtitle, 0, PAGE_H - 95, { align: 'center' });
  }
}

function drawPresentationPage(doc, { colors, headingFonts, bodyFonts }, presentationText) {
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;

  doc.rect(0, 0, PAGE_W, PAGE_H).fill(colors.white);
  const margin = 70;
  let y = 100;

  doc.fontSize(22).fillColor(colors.darkBrown).font(headingFonts.bold)
    .text('Bienvenue chez Homa Home', margin, y);
  y += 40;
  doc.moveTo(margin, y).lineTo(margin + 130, y).lineWidth(1.2).stroke(colors.gold);
  y += 30;

  doc.fontSize(13).fillColor(colors.darkBrown).font(bodyFonts.regular)
    .text(presentationText, margin, y, { width: PAGE_W - margin * 2, lineGap: 4 });
}

/** Page de séparation entre deux catégories, dans le catalogue complet. */
function drawCategoryDividerPage(doc, { colors, headingFonts }, categoryTitle, imagePath) {
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;

  doc.rect(0, 0, PAGE_W, PAGE_H).fill(colors.cream);

  const imgX = 60, imgY = 140, imgW = PAGE_W - 120, imgH = 340;
  drawImageOrPlaceholder(doc, colors, imagePath, imgX, imgY, imgW, imgH);

  doc.moveTo(PAGE_W / 2 - 65, imgY + imgH + 35).lineTo(PAGE_W / 2 + 65, imgY + imgH + 35)
    .lineWidth(1.2).stroke(colors.gold);

  doc.fontSize(30).fillColor(colors.darkBrown).font(headingFonts.bold)
    .text(categoryTitle, 0, imgY + imgH + 55, { align: 'center' });
}

function footerText(brandName, collectionLabel) {
  return `${brandName || "Homa Home"} — Catalogue ${collectionLabel}`;
}

/** Dessine les fiches produits (2 par page) pour une liste de produits, avec footer. */
function drawProductPages(doc, { colors, headingFonts, bodyFonts, brandName }, products, footerLabel, pageNumRef) {
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
    drawImageOrPlaceholder(doc, colors, p.localImagePath, pMargin, topY, imgWCard, cardH - 10);

    const totalStock = p.variants.reduce((sum, v) => sum + Math.max(v.inventoryQuantity, 0), 0);
    const outOfStock = totalStock === 0;

    let ty = topY;
    doc.fontSize(12.5).fillColor(colors.darkBrown).font(headingFonts.bold)
      .text(p.title, contentX, ty, { width: contentW });
    ty = doc.y + 4;

    const price = p.priceRangeV2?.minVariantPrice;
    doc.fontSize(11.5).fillColor(colors.gold).font(headingFonts.bold)
      .text(priceStr(price.amount, price.currencyCode), contentX, ty);
    ty = doc.y + 3;

    // Le délai de fabrication ne s'affiche que pour les pièces en rupture
    // (les articles en stock partent plus vite ; le stock lui-même n'est
    // volontairement pas affiché car il change en permanence).
    if (outOfStock) {
      doc.fontSize(9).fillColor(colors.taupe).font(bodyFonts.italic)
        .text(DELAY_MSG, contentX, ty);
      ty = doc.y + 5;
    } else {
      ty += 2;
    }

    // Description affichée en entier (pas de troncature) : on mesure sa hauteur
    // réelle pour positionner correctement le bloc suivant.
    doc.fontSize(9.5).fillColor(colors.darkBrown).font(bodyFonts.regular);
    const descHeight = doc.heightOfString(p.descriptionPlain, { width: contentW, lineGap: 3 });
    doc.text(p.descriptionPlain, contentX, ty, { width: contentW, lineGap: 3 });
    ty = ty + descHeight + 10;

    // Caractéristiques (dimensions, poids, couleur) issues des metafields produit,
    // affichées en une ligne compacte séparée par des puces.
    if (p.characteristics && p.characteristics.length > 0) {
      const charsLine = p.characteristics.map(c => `${c.label} : ${c.value}`).join('   •   ');
      doc.fontSize(7.5).fillColor(colors.taupe).font(bodyFonts.regular);
      const charsHeight = doc.heightOfString(charsLine, { width: contentW, lineGap: 2 });
      doc.text(charsLine, contentX, ty, { width: contentW, lineGap: 2 });
      ty = ty + charsHeight + 10;
    }

    // La liste "Dimensions disponibles" n'a de sens que s'il y a plusieurs
    // déclinaisons à comparer ; avec une seule variante, le prix déjà affiché
    // en haut de la fiche suffit.
    const singleVariant = p.variants.length === 1;
    if (!singleVariant) {
      doc.fontSize(9).fillColor(colors.darkBrown).font(headingFonts.bold)
        .text('Dimensions disponibles', contentX, ty);
      ty = doc.y + 5;

      doc.fontSize(9).font(bodyFonts.regular);
      const col2 = contentX + contentW * 0.5;
      for (const v of p.variants.slice(0, 4)) {
        doc.fillColor(colors.darkBrown).text(`• ${v.title}`, contentX, ty, { continued: false });
        doc.fillColor(colors.darkBrown).text(priceStr(v.price), col2, ty);
        ty += 14;
      }
    }

    doc.moveTo(pMargin, bottomY).lineTo(PAGE_W - pMargin, bottomY).lineWidth(0.5).stroke(colors.lightLine);
  }

  for (let i = 0; i < products.length; i += 2) {
    doc.addPage();
    doc.rect(0, 0, PAGE_W, PAGE_H).fill(colors.white);

    drawCard(products[i], pMargin);
    if (products[i + 1]) drawCard(products[i + 1], pMargin + cardH + cardGap);

    doc.fontSize(9).fillColor(colors.taupe).font(bodyFonts.regular)
      .text(`${footerText(brandName, footerLabel)} — page ${pageNumRef.n}`, 0, PAGE_H - 30, { align: 'center' });
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
 * @param {object} [opts.theme] - réglages visuels (couleurs, police, accroche) issus des réglages de l'app
 */
export function generateCatalogPDF({ outputPath, collectionMeta, products, coverImagePath, theme }) {
  const t = resolveTheme(theme);
  const brandName = t.brandName || "Homa Home";
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outputPath);
  const finished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  doc.pipe(stream);

  drawCoverPage(doc, t, { title: `Catalogue — ${collectionMeta.title}`, coverImagePath });
  doc.addPage();

  const presentationText = presentationTextFor(t, { brandName, collectionTitle: collectionMeta.title });
  drawPresentationPage(doc, t, presentationText);

  drawProductPages(doc, t, products, collectionMeta.title, { n: 1 });

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
 * @param {object} [opts.theme] - réglages visuels (couleurs, police, accroche) issus des réglages de l'app
 */
export function generateFullCatalogPDF({ outputPath, coverImagePath, sections, theme }) {
  const t = resolveTheme(theme);
  const brandName = t.brandName || "Homa Home";
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outputPath);
  const finished = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  doc.pipe(stream);

  drawCoverPage(doc, t, {
    title: 'Catalogue complet',
    subtitle: sections.map(s => s.title).join(' · '),
    coverImagePath,
  });
  doc.addPage();

  const presentationText = presentationTextFor(t, { brandName, collectionTitle: null });
  drawPresentationPage(doc, t, presentationText);

  const pageNumRef = { n: 1 };
  for (const section of sections) {
    if (section.products.length === 0) continue;
    doc.addPage();
    drawCategoryDividerPage(doc, t, section.title, section.image);
    drawProductPages(doc, t, section.products, section.title, pageNumRef);
  }

  doc.end();
  return finished;
}
