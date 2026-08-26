// Équivalent de shopify.js du script CLI, mais utilise le client GraphQL
// authentifié par session (`admin`) fourni par authenticate.admin(request)
// au lieu d'un token client_credentials — c'est le modèle d'auth d'une
// vraie app Shopify embarquée (OAuth par boutique, pas d'identifiants
// partagés en variables d'environnement).

/** Liste toutes les collections avec leur nombre de produits et leur image. */
export async function listCollections(admin) {
  const query = `#graphql
    query ListCollections($cursor: String) {
      collections(first: 50, after: $cursor) {
        edges {
          node {
            id
            title
            handle
            image { url }
            productsCount { count }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  let collections = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const res = await admin.graphql(query, { variables: { cursor } });
    const { data } = await res.json();
    collections = collections.concat(data.collections.edges.map(e => e.node));
    hasNext = data.collections.pageInfo.hasNextPage;
    cursor = data.collections.pageInfo.endCursor;
  }

  return collections;
}

/** Liste les menus de navigation configurés dans Shopify (Contenu > Menus). */
export async function listMenus(admin) {
  const query = `#graphql
    query ListMenus {
      menus(first: 250) {
        nodes { handle title }
      }
    }
  `;
  const res = await admin.graphql(query);
  const { data } = await res.json();
  return data?.menus?.nodes || [];
}

/**
 * Transforme le menu choisi en sections de catalogue. On ne conserve que les
 * entrées qui pointent vers des collections Shopify ; pages et liens externes
 * restent de la navigation, mais n'ont pas de sens dans un catalogue produit.
 */
export async function getMenuCollections(admin, handle) {
  if (!handle) return [];
  const query = `#graphql
    query MenuCollections {
      menus(first: 250) {
        nodes {
          handle
          items {
            title
            type
            resourceId
            items {
              title
              type
              resourceId
            }
          }
        }
      }
    }
  `;
  const res = await admin.graphql(query);
  const { data } = await res.json();
  const menu = data?.menus?.nodes?.find((item) => item.handle === handle);
  if (!menu) return [];

  const sections = [];
  const addCollection = (item) => {
    if (item.type === "COLLECTION" && item.resourceId && !sections.some((section) => section.id === item.resourceId)) {
      sections.push({ id: item.resourceId, title: item.title });
    }
  };
  for (const item of menu.items) {
    addCollection(item);
    for (const child of item.items || []) addCollection(child);
  }
  return sections;
}

/** Récupère tous les produits actifs d'une collection, avec image principale et variantes. */
export async function getProductsForCollection(admin, collectionId) {
  const query = `#graphql
    query ProductsInCollection($id: ID!, $cursor: String) {
      collection(id: $id) {
        title
        image { url }
        products(first: 50, after: $cursor) {
          edges {
            node {
              title
              descriptionHtml
              status
              featuredMedia { preview { image { url } } }
              priceRangeV2 { minVariantPrice { amount currencyCode } }
              variants(first: 10) {
                edges {
                  node {
                    title
                    price
                    inventoryQuantity
                  }
                }
              }
              metafields(namespace: "custom", first: 20) {
                edges { node { key value type } }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  let products = [];
  let cursor = null;
  let hasNext = true;
  let collectionMeta = null;

  while (hasNext) {
    const res = await admin.graphql(query, { variables: { id: collectionId, cursor } });
    const { data } = await res.json();
    if (!data.collection) throw new Error('Collection introuvable.');
    collectionMeta = { title: data.collection.title, image: data.collection.image?.url || null };
    const active = data.collection.products.edges
      .map(e => e.node)
      .filter(p => p.status === 'ACTIVE');
    products = products.concat(active);
    hasNext = data.collection.products.pageInfo.hasNextPage;
    cursor = data.collection.products.pageInfo.endCursor;
  }

  return { collectionMeta, products };
}

const DIMENSION_UNIT_LABELS = { CENTIMETERS: 'cm', MILLIMETERS: 'mm', METERS: 'm', INCHES: 'in', FEET: 'ft' };
const WEIGHT_UNIT_LABELS = { KILOGRAMS: 'kg', GRAMS: 'g', POUNDS: 'lb', OUNCES: 'oz' };

/** Formate la valeur JSON brute d'un metafield de type "dimension" ou "weight" (ex: {"value":50,"unit":"CENTIMETERS"} → "50 cm"). */
function formatMeasurement(rawValue, unitLabels) {
  if (!rawValue) return null;
  try {
    const { value, unit } = JSON.parse(rawValue);
    const n = Number(value);
    const formatted = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return `${formatted} ${unitLabels[unit] || unit.toLowerCase()}`;
  } catch {
    return null;
  }
}

// Le magasin n'utilise pas les mêmes clés de metafield selon le type de produit
// (ex: chaises → style/matériau/couleur(s), meubles → longueur/largeur/...).
// On normalise donc les variantes connues vers une clé canonique unique, avec
// un ordre d'affichage fixe pour les caractéristiques les plus courantes.
const KEY_ALIASES = {
  'profondeur-': 'profondeur',
  profondeur1: 'profondeur',
  'couleur(s)': 'couleur',
  'matière': 'matériau',
};
const KEY_LABELS = {
  longueur: 'Longueur',
  largeur: 'Largeur',
  hauteur: 'Hauteur',
  profondeur: 'Profondeur',
  diameter: 'Diamètre',
  poids: 'Poids',
  couleur: 'Couleur',
  'matériau': 'Matériau',
  style: 'Style',
};
const CHARACTERISTIC_ORDER = ['longueur', 'largeur', 'hauteur', 'profondeur', 'diameter', 'poids', 'couleur', 'matériau', 'style'];
// Champs internes (logistique, tests) qui n'ont rien à faire dans un catalogue client.
const IGNORED_KEYS = new Set(['coli(s)', 'colis', 'test']);

function formatMetafieldValue(value, type) {
  switch (type) {
    case 'dimension': return formatMeasurement(value, DIMENSION_UNIT_LABELS);
    case 'weight': return formatMeasurement(value, WEIGHT_UNIT_LABELS);
    case 'single_line_text_field':
      return value || null;
    case 'list.single_line_text_field':
      try {
        return JSON.parse(value).join(', ');
      } catch {
        return value || null;
      }
    default:
      // Types non gérés (référence à un metaobject, nombre décimal libre, etc.)
      // : pas de représentation texte fiable, on ignore plutôt que d'afficher un ID brut.
      return null;
  }
}

function humanizeKey(key) {
  const cleaned = key.replace(/\(s\)/i, '').replace(/[-_]/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Construit la liste des caractéristiques d'un produit (dimensions, poids,
 * couleur, matériau, style…) à partir de tous les metafields "custom.*" du
 * produit. Les clés équivalentes (ex: profondeur/profondeur-/profondeur1)
 * sont fusionnées, les champs internes sont exclus, et les caractéristiques
 * connues sont affichées dans un ordre fixe (les autres ensuite).
 */
export function buildCharacteristics(metafieldNodes) {
  const byKey = new Map();

  for (const { key, value, type } of metafieldNodes) {
    if (!value) continue;
    const canonicalKey = (KEY_ALIASES[key] || key).toLowerCase();
    if (IGNORED_KEYS.has(canonicalKey)) continue;
    if (byKey.has(canonicalKey)) continue; // clés équivalentes déjà couvertes (ex: profondeur1 après profondeur)

    const formatted = formatMetafieldValue(value, type);
    if (formatted) byKey.set(canonicalKey, formatted);
  }

  const ordered = [];
  for (const key of CHARACTERISTIC_ORDER) {
    if (byKey.has(key)) {
      ordered.push({ label: KEY_LABELS[key] || humanizeKey(key), value: byKey.get(key) });
      byKey.delete(key);
    }
  }
  for (const [key, value] of byKey) {
    ordered.push({ label: KEY_LABELS[key] || humanizeKey(key), value });
  }

  return ordered;
}

export function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Tronque un texte à la limite de mot la plus proche, sans jamais couper au milieu d'un mot. */
export function truncateAtWord(text, maxLength) {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/**
 * Tronque un texte à la fin d'une phrase complète (".") en visant maxWords
 * mots. On cherche d'abord le dernier point dans les maxWords premiers mots ;
 * si la toute première phrase dépasse déjà maxWords mots (pas de point
 * trouvé), on va chercher le point suivant plutôt que de couper au milieu
 * d'une phrase — mieux vaut dépasser un peu la limite que produire une
 * coupure disgracieuse. En dernier recours (texte sans aucun point), on
 * tronque à maxWords mots avec "…".
 */
export function truncateAtSentence(text, maxWords = 80) {
  if (!text) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  const withinLimit = words.slice(0, maxWords).join(' ');
  const lastDot = withinLimit.lastIndexOf('.');
  if (lastDot > 0) return withinLimit.slice(0, lastDot + 1);

  const rest = words.slice(maxWords).join(' ');
  const nextDot = rest.indexOf('.');
  if (nextDot > 0) return `${withinLimit} ${rest.slice(0, nextDot + 1)}`;

  return `${withinLimit}…`;
}

const MAIN_MENU_CATEGORIES = [
  { title: 'Salons', handle: 'salons' },
  { title: 'Salle à manger', handle: 'salle-a-manger' },
  { title: 'Chambres', handle: 'chambres' },
  { title: 'Luminaires', handle: 'luminaires' },
  { title: 'Professionnels', handle: 'professionnels' },
  { title: 'Extérieur', handle: 'exterieur' },
  { title: 'Décorations', handle: 'decoration' },
];

export { MAIN_MENU_CATEGORIES };
