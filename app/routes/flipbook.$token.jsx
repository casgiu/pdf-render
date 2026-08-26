import fs from "fs";
import { getJobByFlipbookToken } from "../lib/catalogue-jobs.server";
import { getObjectBuffer } from "../lib/object-storage.server";

// Page publique (pas d'authentification Shopify) : le lien est fait pour
// être partagé avec des clients, pas seulement consulté depuis l'admin.
export const loader = async ({ params }) => {
  const job = await getJobByFlipbookToken(params.token);

  if (!job || job.flipbookStatus !== "done") {
    throw new Response("Flipbook introuvable.", { status: 404 });
  }

  const html = job.flipbookKey
    ? (await getObjectBuffer(job.flipbookKey)).toString("utf8")
    : job.flipbookPath && fs.existsSync(job.flipbookPath)
      ? fs.readFileSync(job.flipbookPath, "utf8")
      : null;
  if (!html) throw new Response("Flipbook introuvable.", { status: 404 });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};
