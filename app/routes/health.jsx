import { getHealthStatus } from "../lib/health.server.js";
import { logger } from "../lib/observability.server.js";

/** Endpoint public pour Render et la supervision : aucune donnée sensible n'est retournée. */
export const loader = async () => {
  const health = await getHealthStatus();
  if (!health.healthy) logger.warn("health_check_degraded", { checks: health.checks });

  return Response.json(health, {
    status: health.healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
};
