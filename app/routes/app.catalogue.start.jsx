import { authenticate } from "../shopify.server";
import { createJob } from "../lib/catalogue-jobs.server";
import { enqueueCatalogueJob } from "../lib/job-queue.server";

// Démarre une génération de catalogue en tâche de fond et répond tout de
// suite avec l'id du job, plutôt que de faire attendre la requête HTTP
// pendant potentiellement plusieurs minutes (catalogue complet = beaucoup
// de produits + téléchargement/compression d'image par produit).
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const type = formData.get("type");
  const collectionId = formData.get("collectionId");
  const label = formData.get("label") || (type === "full" ? "Catalogue complet" : "Collection");

  const { job, alreadyActive } = await createJob({ shop: session.shop, type, label, collectionId: collectionId || null });

  if (!alreadyActive) await enqueueCatalogueJob(job.id);

  return { jobId: job.id, alreadyActive };
};
