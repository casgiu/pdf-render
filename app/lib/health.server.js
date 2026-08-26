import prisma from "../db.server.js";
import { getQueueConnection } from "./job-queue.server.js";
import { checkObjectStorageHealth } from "./object-storage.server.js";

async function check(operation) {
  const startedAt = performance.now();
  try {
    await operation();
    return { status: "ok", latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

export async function getHealthStatus() {
  const checks = {
    database: await check(() => prisma.$queryRaw`SELECT 1`),
    redis: await check(() => getQueueConnection().ping()),
    objectStorage: await check(checkObjectStorageHealth),
  };
  const healthy = Object.values(checks).every((result) => result.status === "ok");

  return {
    healthy,
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  };
}
