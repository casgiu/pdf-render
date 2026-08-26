import { authenticate } from "../shopify.server";
import { getJob } from "../lib/catalogue-jobs.server";
import { enqueueFlipbookJob } from "../lib/job-queue.server";

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const job = await getJob(params.id, session.shop);

  if (!job || job.status !== "done") {
    return Response.json({ error: "Catalogue introuvable ou pas encore prêt." }, { status: 400 });
  }

  await enqueueFlipbookJob(job.id);

  return { started: true };
};
