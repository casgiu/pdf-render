import fs from "fs";
import { authenticate } from "../shopify.server";
import { getJob } from "../lib/catalogue-jobs.server";
import { getObjectBuffer } from "../lib/object-storage.server";

// Sert le PDF d'un job terminé. Le fichier reste sur le disque persistant
// (contrairement à l'ancienne version synchrone qui le supprimait après
// coup) pour permettre un re-téléchargement instantané depuis l'historique.
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const job = await getJob(params.id, session.shop);

  if (!job || job.status !== "done") {
    throw new Response("Catalogue introuvable ou pas encore prêt.", { status: 404 });
  }

  const buffer = job.fileKey
    ? await getObjectBuffer(job.fileKey)
    : job.filePath && fs.existsSync(job.filePath)
      ? fs.readFileSync(job.filePath)
      : null;
  if (!buffer) throw new Response("Catalogue introuvable ou pas encore prêt.", { status: 404 });
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${job.fileName}"`,
    },
  });
};
