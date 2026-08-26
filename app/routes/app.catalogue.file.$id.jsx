import fs from "fs";
import { Readable } from "stream";
import { authenticate } from "../shopify.server";
import { getJob } from "../lib/catalogue-jobs.server";
import { getObjectStream } from "../lib/object-storage.server";

// Sert le PDF d'un job terminé. Le fichier reste sur le disque persistant
// (contrairement à l'ancienne version synchrone qui le supprimait après
// coup) pour permettre un re-téléchargement instantané depuis l'historique.
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const job = await getJob(params.id, session.shop);

  if (!job || job.status !== "done") {
    throw new Response("Catalogue introuvable ou pas encore prêt.", { status: 404 });
  }

  const body = job.fileKey
    ? Readable.toWeb(await getObjectStream(job.fileKey))
    : job.filePath && fs.existsSync(job.filePath)
      ? fs.readFileSync(job.filePath)
      : null;
  if (!body) throw new Response("Catalogue introuvable ou pas encore prêt.", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${job.fileName}"`,
    },
  });
};
