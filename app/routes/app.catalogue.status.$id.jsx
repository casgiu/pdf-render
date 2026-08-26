import { authenticate } from "../shopify.server";
import { getJob } from "../lib/catalogue-jobs.server";

// Poll léger côté client pendant qu'un job tourne en tâche de fond.
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const job = await getJob(params.id, session.shop);

  if (!job) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({
    id: job.id,
    status: job.status,
    label: job.label,
    fileName: job.fileName,
    errorMessage: job.errorMessage,
    flipbookStatus: job.flipbookStatus,
    flipbookToken: job.flipbookToken,
    flipbookError: job.flipbookError,
    flipbookPublished: job.flipbookPublished,
  });
};
