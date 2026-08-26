import { authenticate } from "../shopify.server";
import { listImageFiles } from "../lib/shopify-data.server";

/** Images de Contenu > Fichiers, utilisées uniquement par le sélecteur de logo. */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  try {
    return Response.json({ files: await listImageFiles(admin) });
  } catch (error) {
    return Response.json(
      { error: "Impossible de lire les fichiers Shopify. Réinstallez ou réautorisez l’application pour accorder l’accès aux fichiers." },
      { status: 403 },
    );
  }
};
