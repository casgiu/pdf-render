import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAME = "pdf-render";

let connection;
let queue;

function getConnection() {
  if (!connection) {
    if (!process.env.REDIS_URL) throw new Error("REDIS_URL est requis pour lancer une génération.");
    connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return queue;
}

export async function enqueueCatalogueJob(jobId) {
  return getQueue().add("catalogue", { jobId }, { jobId: `catalogue-${jobId}` });
}

export async function enqueueFlipbookJob(jobId) {
  return getQueue().add("flipbook", { jobId }, { jobId: `flipbook-${jobId}` });
}

export function getQueueConnection() {
  return getConnection();
}
