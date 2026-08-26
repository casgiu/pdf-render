import prisma from "../db.server.js";

// Styles standard PDF disponibles sans téléchargement ni dépendance externe.
// Ils restent donc fiables quel que soit l'environnement qui génère le catalogue.
export const FONT_FAMILIES = {
  helvetica: { label: "Helvetica (sans-serif, actuel)", regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" },
  helveticaBold: { label: "Helvetica gras", regular: "Helvetica-Bold", bold: "Helvetica-Bold", italic: "Helvetica-BoldOblique" },
  helveticaItalic: { label: "Helvetica italique", regular: "Helvetica-Oblique", bold: "Helvetica-BoldOblique", italic: "Helvetica-Oblique" },
  times: { label: "Times (serif, classique)", regular: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic" },
  timesBold: { label: "Times gras", regular: "Times-Bold", bold: "Times-Bold", italic: "Times-BoldItalic" },
  timesItalic: { label: "Times italique", regular: "Times-Italic", bold: "Times-BoldItalic", italic: "Times-Italic" },
  courier: { label: "Courier (monospace)", regular: "Courier", bold: "Courier-Bold", italic: "Courier-Oblique" },
  courierBold: { label: "Courier gras", regular: "Courier-Bold", bold: "Courier-Bold", italic: "Courier-BoldOblique" },
  courierItalic: { label: "Courier italique", regular: "Courier-Oblique", bold: "Courier-BoldOblique", italic: "Courier-Oblique" },
};

const DEFAULTS = {
  backgroundColor: "#F5F1EA",
  textColor: "#3B2E24",
  accentColor: "#B08D57",
  mutedColor: "#8A7B6C",
  lineColor: "#D8CFC0",
  fontFamily: "helvetica",
  headingFontFamily: "helvetica",
  bodyFontFamily: "helvetica",
  tagline: "Découvrez notre sélection",
  presentationText: "",
  brandName: "",
  logoUrl: "",
  mainMenuHandle: "",
};

export async function getTheme(shop) {
  const row = await prisma.catalogueTheme.findUnique({ where: { shop } });
  const theme = row ? { ...DEFAULTS, ...row } : { ...DEFAULTS, shop };
  // Les boutiques déjà configurées conservent leur ancienne police unique.
  return {
    ...theme,
    headingFontFamily: theme.headingFontFamily || theme.fontFamily,
    bodyFontFamily: theme.bodyFontFamily || theme.fontFamily,
  };
}

export async function saveTheme(shop, data) {
  const fields = {
    backgroundColor: data.backgroundColor,
    textColor: data.textColor,
    accentColor: data.accentColor,
    mutedColor: data.mutedColor,
    lineColor: data.lineColor,
    fontFamily: FONT_FAMILIES[data.fontFamily] ? data.fontFamily : DEFAULTS.fontFamily,
    headingFontFamily: FONT_FAMILIES[data.headingFontFamily] ? data.headingFontFamily : DEFAULTS.headingFontFamily,
    bodyFontFamily: FONT_FAMILIES[data.bodyFontFamily] ? data.bodyFontFamily : DEFAULTS.bodyFontFamily,
    tagline: data.tagline || DEFAULTS.tagline,
    presentationText: data.presentationText?.trim() || "",
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

export function isOnboardingComplete(theme) {
  return Boolean(theme?.brandName?.trim() && theme?.mainMenuHandle?.trim());
}

export async function completeOnboarding(shop) {
  return prisma.catalogueTheme.update({
    where: { shop },
    data: { onboardingCompletedAt: new Date() },
  });
}
