import { authenticate } from "../shopify.server";
import { createJob, runJob } from "../lib/catalogue-jobs.server";

// Démarre une génération de catalogue en tâche de fond et répond tout de
// suite avec l'id du job, plutôt que de faire attendre la requête HTTP
// pendant potentiellement plusieurs minutes (catalogue complet = beaucoup
// de produits + téléchargement/compression d'image par produit).
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const type = formData.get("type");
  const collectionId = formData.get("collectionId");
  const label = formData.get("label") || (type === "full" ? "Catalogue complet" : "Collection");

  const job = await createJob({ shop: session.shop, type, label, collectionId: collectionId || null });

  // Fire-and-forget : ne pas attendre, mais ne jamais laisser une rejection
  // non gérée planter le process.
  runJob(job.id, admin).catch((err) => {
    console.error(`[catalogue-job ${job.id}] rejection non interceptée :`, err);
  });

  return { jobId: job.id };
};
