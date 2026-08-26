import prisma from "../db.server";

// Familles de polices proposées dans les réglages. On se limite volontairement
// aux polices standard PDF (base 14) : elles n'ont pas besoin d'être embarquées
// dans le fichier, contrairement à une police custom (Google Fonts, etc.) qui
// demanderait de télécharger et enregistrer un fichier .ttf via doc.registerFont.
export const FONT_FAMILIES = {
  helvetica: { label: "Helvetica (sans-serif, actuel)", regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" },
  times: { label: "Times (serif, classique)", regular: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic" },
  courier: { label: "Courier (monospace)", regular: "Courier", bold: "Courier-Bold", italic: "Courier-Oblique" },
};

const DEFAULTS = {
  backgroundColor: "#F5F1EA",
  textColor: "#3B2E24",
  accentColor: "#B08D57",
  mutedColor: "#8A7B6C",
  lineColor: "#D8CFC0",
  fontFamily: "helvetica",
  tagline: "Mobilier & décoration haut de gamme",
  brandName: "",
  logoUrl: "",
  mainMenuHandle: "",
};

export async function getTheme(shop) {
  const row = await prisma.catalogueTheme.findUnique({ where: { shop } });
  return row ? { ...DEFAULTS, ...row } : { ...DEFAULTS, shop };
}

export async function saveTheme(shop, data) {
  const fields = {
    backgroundColor: data.backgroundColor,
    textColor: data.textColor,
    accentColor: data.accentColor,
    mutedColor: data.mutedColor,
    lineColor: data.lineColor,
    fontFamily: FONT_FAMILIES[data.fontFamily] ? data.fontFamily : DEFAULTS.fontFamily,
    tagline: data.tagline || DEFAULTS.tagline,
    brandName: data.brandName?.trim() || "",
    logoUrl: data.logoUrl?.trim() || "",
    mainMenuHandle: data.mainMenuHandle?.trim() || "",
  };
  return prisma.catalogueTheme.upsert({
    where: { shop },
    create: { shop, ...fields },
    update: fields,
  });
}
