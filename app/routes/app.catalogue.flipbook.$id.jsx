import { authenticate } from "../shopify.server";
import { getJob, runFlipbookJob } from "../lib/catalogue-jobs.server";

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const job = await getJob(params.id, session.shop);

  if (!job || job.status !== "done") {
    return Response.json({ error: "Catalogue introuvable ou pas encore prêt." }, { status: 400 });
  }

  runFlipbookJob(job.id).catch((err) => {
    console.error(`[flipbook-job ${job.id}] rejection non interceptée :`, err);
  });

  return { started: true };
};
