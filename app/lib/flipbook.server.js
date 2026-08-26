import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_FLIP_BUNDLE_PATH = path.join(__dirname, "..", "..", "node_modules", "page-flip", "dist", "js", "page-flip.browser.js");

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Convertit chaque page du PDF en JPEG via pdftoppm (poppler), dans un dossier temporaire dédié. */
function renderPdfPagesToJpegs(pdfPath) {
  const tmpDir = path.join(os.tmpdir(), `flipbook-render-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const prefix = path.join(tmpDir, "page");

  // Résolution/qualité modérées : ces images sont encodées en base64 dans une
  // seule page HTML (pas de fichiers séparés à servir), donc on limite leur
  // poids pour que la page reste raisonnable même sur un catalogue complet.
  const result = spawnSync("pdftoppm", ["-jpeg", "-jpegopt", "quality=75", "-r", "100", pdfPath, prefix]);
  if (result.status !== 0) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`pdftoppm a échoué : ${result.stderr?.toString().slice(0, 300) || "erreur inconnue"}`);
  }

  const files = fs
    .readdirSync(tmpDir)
    .filter((f) => f.startsWith("page") && f.endsWith(".jpg"))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)\.jpg$/)[1], 10);
      const nb = parseInt(b.match(/(\d+)\.jpg$/)[1], 10);
      return na - nb;
    })
    .map((f) => path.join(tmpDir, f));

  return { tmpDir, files };
}

function buildFlipbookHtml(title, pageDataUris) {
  const bundle = fs.readFileSync(PAGE_FLIP_BUNDLE_PATH, "utf8");
  const pagesJson = JSON.stringify(pageDataUris);
  const safeTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --cream:#F5F1EA; --brown:#3B2E24; --gold:#B08D57; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:var(--cream); display:flex; flex-direction:column; align-items:center; justify-content:center; font-family: Georgia, 'Times New Roman', serif; color: var(--brown); padding: 24px; }
  h1 { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: normal; color: var(--gold); margin: 0 0 16px; }
  #flipbook { box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
  #flipbook img { width:100%; height:100%; display:block; user-select:none; -webkit-user-drag:none; }
  .controls { display:flex; align-items:center; gap:16px; margin-top:18px; }
  button { background:var(--brown); color:var(--cream); border:none; padding:8px 16px; border-radius:3px; cursor:pointer; font-family: inherit; font-size:13px; letter-spacing:0.03em; }
  button:hover { background:var(--gold); }
  button:disabled { opacity:0.35; cursor:default; }
  #pageIndicator { font-size:13px; color:var(--brown); min-width:70px; text-align:center; }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
<div id="flipbook"></div>
<div class="controls">
  <button id="prevBtn">‹ Précédent</button>
  <span id="pageIndicator">— / —</span>
  <button id="nextBtn">Suivant ›</button>
</div>
<script>${bundle}</script>
<script>
  const pages = ${pagesJson};
  const el = document.getElementById('flipbook');
  const pageFlip = new St.PageFlip(el, {
    width: 500,
    height: 707,
    size: 'stretch',
    minWidth: 300,
    maxWidth: 1100,
    minHeight: 420,
    maxHeight: 1556,
    maxShadowOpacity: 0.5,
    showCover: true,
    mobileScrollSupport: false,
    usePortrait: true,
  });
  pageFlip.loadFromImages(pages);

  const indicator = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  function updateIndicator() {
    indicator.textContent = (pageFlip.getCurrentPageIndex() + 1) + ' / ' + pages.length;
  }
  pageFlip.on('flip', updateIndicator);
  updateIndicator();

  prevBtn.addEventListener('click', () => pageFlip.flipPrev());
  nextBtn.addEventListener('click', () => pageFlip.flipNext());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') pageFlip.flipNext();
    if (e.key === 'ArrowLeft') pageFlip.flipPrev();
  });
</script>
</body>
</html>`;
}

/**
 * Génère un flipbook HTML autonome (images intégrées en base64) à partir
 * d'un PDF déjà généré, et l'écrit à outputHtmlPath.
 */
export async function generateFlipbook(pdfPath, title, outputHtmlPath) {
  const { tmpDir, files } = renderPdfPagesToJpegs(pdfPath);
  try {
    const pageDataUris = files.map((f) => {
      const buffer = fs.readFileSync(f);
      return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    });
    const html = buildFlipbookHtml(title, pageDataUris);
    fs.mkdirSync(path.dirname(outputHtmlPath), { recursive: true });
    fs.writeFileSync(outputHtmlPath, html);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
