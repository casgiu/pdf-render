/**
 * Détecte les éléments de marque publics sans dépendre d'un thème Shopify
 * particulier. Un thème peut représenter son en-tête de dizaines de façons ;
 * cette détection est donc un assistant qui propose un résultat à confirmer,
 * jamais une écriture automatique dans les réglages.
 */
function decodeHtml(value = "") {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : null;
}

function imageCandidates(html, baseUrl, weight) {
  const candidates = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const url = attribute(tag, "src") || attribute(tag, "data-src") || attribute(tag, "data-original");
    if (!url || url.startsWith("data:")) continue;

    try {
      const alt = attribute(tag, "alt") || "";
      const haystack = `${tag} ${alt}`.toLowerCase();
      candidates.push({
        url: new URL(url, baseUrl).href,
        score: weight + (/(^|[-_\s])logo([-_\s]|$)|brand/.test(haystack) ? 100 : 0),
      });
    } catch {
      // URL non exploitable : on tente le candidat suivant.
    }
  }
  return candidates;
}

function jsonLdCandidates(html, baseUrl) {
  const candidates = [];
  for (const block of html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []) {
    const content = block.replace(/^.*?>/s, "").replace(/<\/script>$/i, "");
    try {
      const entries = Array.isArray(JSON.parse(content)) ? JSON.parse(content) : [JSON.parse(content)];
      for (const entry of entries) {
        const logo = entry?.logo?.url || entry?.logo;
        if (typeof logo === "string") candidates.push({ url: new URL(logo, baseUrl).href, score: 80 });
      }
    } catch {
      // Le JSON-LD est optionnel et souvent enrichi par des scripts tiers.
    }
  }
  return candidates;
}

/** Retourne une proposition de marque issue de Shopify et de la page publique. */
export async function detectBrand(admin) {
  const response = await admin.graphql(`#graphql
    query ShopIdentity {
      shop {
        name
        primaryDomain { url }
      }
    }
  `);
  const { data } = await response.json();
  const name = data?.shop?.name || "";
  const storefrontUrl = data?.shop?.primaryDomain?.url;
  if (!storefrontUrl) return { name, logoUrl: null, source: "shopify" };

  try {
    const page = await fetch(storefrontUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalogueBrandImporter/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!page.ok) throw new Error(`La page d'accueil a répondu ${page.status}`);
    const html = await page.text();
    const header = html.match(/<header\b[\s\S]*?<\/header>/i)?.[0] || "";
    const candidates = [
      ...imageCandidates(header, storefrontUrl, 200),
      ...jsonLdCandidates(html, storefrontUrl),
      ...imageCandidates(html, storefrontUrl, 0),
    ];
    candidates.sort((a, b) => b.score - a.score);
    return { name, logoUrl: candidates[0]?.url || null, source: candidates[0] ? "homepage" : "shopify" };
  } catch (error) {
    return { name, logoUrl: null, source: "shopify", warning: error.message };
  }
}
