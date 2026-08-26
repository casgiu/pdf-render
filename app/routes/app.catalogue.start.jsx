import { authenticate } from "../shopify.server";
import { createJob } from "../lib/catalogue-jobs.server";
import { parseCatalogueJobInput } from "../lib/job-input.server";
import { enqueueCatalogueJob } from "../lib/job-queue.server";

// Démarre une génération de catalogue en tâche de fond et répond tout de
// suite avec l'id du job, plutôt que de faire attendre la requête HTTP
// pendant potentiellement plusieurs minutes (catalogue complet = beaucoup
// de produits + téléchargement/compression d'image par produit).
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const input = parseCatalogueJobInput(formData);
  if (input.error) return Response.json({ error: input.error }, { status: 400 });

  const { job, alreadyActive } = await createJob({ shop: session.shop, ...input });

  if (!alreadyActive) await enqueueCatalogueJob(job.id);

  return { jobId: job.id, alreadyActive };
};
