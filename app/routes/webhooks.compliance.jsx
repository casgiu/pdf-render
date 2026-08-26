import { authenticate } from "../shopify.server.js";
import { logger } from "../lib/observability.server.js";
import { purgeShopData } from "../lib/shop-data-purge.server.js";

export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);
  logger.info("shopify_compliance_webhook_received", { topic, shop });

  // FolioMise doesn't persist customer records. The acknowledgement still
  // fulfils data request and customer redaction obligations for every app.
  if (["SHOP_REDACT", "shop/redact"].includes(topic)) await purgeShopData(shop);

  return new Response(null, { status: 200 });
};
