import { authenticate } from "../shopify.server";
import { detectBrand } from "../lib/brand-detection.server";
import { reportError } from "../lib/observability.server.js";

// Route ressource dédiée : elle évite de mélanger une réponse JSON avec
// l'action HTML de la page Réglages dans le fetch sécurisé d'App Bridge.
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  try {
    return Response.json(await detectBrand(admin));
  } catch (error) {
    reportError("brand_detection_failed", error);
    return Response.json(
      { error: error.message || "L'analyse automatique a échoué." },
      { status: 500 },
    );
  }
};
