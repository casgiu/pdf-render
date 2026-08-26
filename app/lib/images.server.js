import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import sharp from 'sharp';

const CACHE_DIR = path.join(os.tmpdir(), 'pdf-render-image-cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(address) {
  const [first, second] = address.split('.').map(Number);
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 192 && second === 0)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}

/** Reject loopback, private, link-local, and other non-public IP addresses. */
export function isPublicIpAddress(address) {
  const family = isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family !== 6) return false;

  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return false;
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isPublicIpAddress(mappedIpv4) : true;
}

export function parsePublicImageUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('L’URL de l’image doit utiliser HTTPS sans identifiants.');
  }
  return url;
}

async function resolvePublicAddress(hostname) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const address = addresses.find(({ address: candidate }) => isPublicIpAddress(candidate));
  if (!address || addresses.some(({ address: candidate }) => !isPublicIpAddress(candidate))) {
    throw new Error('L’hôte de l’image ne résout pas vers une adresse publique.');
  }
  return address;
}

async function fetchPublicImage(value, redirects = 0) {
  const url = parsePublicImageUrl(value);
  const address = await resolvePublicAddress(url.hostname);

  return new Promise((resolve, reject) => {
    const request = https.get({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      headers: { 'User-Agent': 'FolioMise/1.0' },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) return reject(new Error('Trop de redirections pour l’image.'));
        return resolve(fetchPublicImage(new URL(response.headers.location, url).href, redirects + 1));
      }
      if (status < 200 || status >= 300) {
        response.resume();
        return reject(new Error(`Le serveur d’image a répondu ${status}.`));
      }
      if (!response.headers['content-type']?.startsWith('image/')) {
        response.resume();
        return reject(new Error('La ressource téléchargée n’est pas une image.'));
      }
      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        response.resume();
        return reject(new Error('L’image dépasse la taille maximale autorisée.'));
      }

      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          response.destroy(new Error('L’image dépasse la taille maximale autorisée.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Le téléchargement de l’image a expiré.')));
    request.on('error', reject);
  });
}

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
    const buffer = await fetchPublicImage(resizedUrl);
    // flatten() remplace la transparence éventuelle (PNG) par un fond blanc,
    // requis puisque le JPEG ne supporte pas la transparence.
    const jpegBuffer = await sharp(buffer)
      .limitInputPixels(MAX_IMAGE_PIXELS)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(localPath, jpegBuffer);
    return localPath;
  } catch (err) {
    const host = (() => {
      try { return new URL(url).hostname; } catch { return 'URL invalide'; }
    })();
    console.warn(`⚠️  Échec téléchargement image depuis ${host} — ${err.message}`);
    return null;
  }
}
