import { authenticate } from "../shopify.server";
import { detectBrand } from "../lib/brand-detection.server";

// Route ressource dédiée : elle évite de mélanger une réponse JSON avec
// l'action HTML de la page Réglages dans le fetch sécurisé d'App Bridge.
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  try {
    return Response.json(await detectBrand(admin));
  } catch (error) {
    console.error("[brand-detection] échec :", error);
    return Response.json(
      { error: error.message || "L'analyse automatique a échoué." },
      { status: 500 },
    );
  }
};
