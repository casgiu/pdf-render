import fs from "fs";
import { authenticate } from "../shopify.server";
import { getJob } from "../lib/catalogue-jobs.server";

// Sert le PDF d'un job terminé. Le fichier reste sur le disque persistant
// (contrairement à l'ancienne version synchrone qui le supprimait après
// coup) pour permettre un re-téléchargement instantané depuis l'historique.
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const job = await getJob(params.id, session.shop);

  if (!job || job.status !== "done" || !job.filePath || !fs.existsSync(job.filePath)) {
    throw new Response("Catalogue introuvable ou pas encore prêt.", { status: 404 });
  }

  const buffer = fs.readFileSync(job.filePath);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${job.fileName}"`,
    },
  });
};
