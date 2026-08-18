import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import sharp from 'sharp';

const CACHE_DIR = path.join(os.tmpdir(), 'pdf-render-image-cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

/**
 * Télécharge une image, la recompresse en JPEG et la met en cache localement.
 * Les photos Shopify sont souvent des PNG de plusieurs centaines de Ko (même
 * redimensionnées) : les reconvertir en JPEG divise leur poids par ~15-20
 * sans perte visible dans le PDF, ce qui est essentiel pour le catalogue
 * complet (500+ produits).
 * @param {string} url
 * @param {number} maxWidth - largeur max demandée à Shopify (économise bande passante et poids du PDF)
 * @param {number} quality - qualité JPEG (0-100)
 * Retourne le chemin du fichier local, ou null si l'URL est absente/échoue.
 */
export async function downloadImage(url, maxWidth = 700, quality = 75) {
  if (!url) return null;

  // Shopify sait redimensionner ses images à la volée via un paramètre d'URL.
  // On demande directement la taille utile au lieu de télécharger le fichier
  // plein format (souvent 2000px+) pour l'afficher en ~400px dans le PDF.
  const resizedUrl = url.includes('?')
    ? `${url}&width=${maxWidth}`
    : `${url}?width=${maxWidth}`;

  const hash = crypto.createHash('sha256').update(`${resizedUrl}|q${quality}`).digest('hex');
  const localPath = path.join(CACHE_DIR, `${hash}.jpg`);

  if (fs.existsSync(localPath)) return localPath;

  try {
    const res = await fetch(resizedUrl);
    if (!res.ok) {
      console.warn(`⚠️  Image non récupérée (${res.status}): ${url}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    // flatten() remplace la transparence éventuelle (PNG) par un fond blanc,
    // requis puisque le JPEG ne supporte pas la transparence.
    const jpegBuffer = await sharp(buffer)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(localPath, jpegBuffer);
    return localPath;
  } catch (err) {
    console.warn(`⚠️  Échec téléchargement image: ${url} — ${err.message}`);
    return null;
  }
}
