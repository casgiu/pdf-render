import { authenticate } from "../shopify.server.js";
import { revokeFlipbook } from "../lib/catalogue-jobs.server.js";

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const job = await revokeFlipbook(params.id, session.shop);
  if (!job) return Response.json({ error: "Flipbook introuvable." }, { status: 404 });
  return Response.json({ ok: true });
};
