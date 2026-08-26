import { Worker } from "bullmq";
import prisma from "./db.server.js";
import { runFlipbookJob, runJob } from "./lib/catalogue-jobs.server.js";
import { enqueueCatalogueJob, enqueueFlipbookJob, getQueueConnection, QUEUE_NAME } from "./lib/job-queue.server.js";
import { unauthenticated } from "./shopify.server.js";
import { logger, reportError } from "./lib/observability.server.js";

let worker;

async function processJob(queueJob) {
  const { jobId } = queueJob.data;
  const catalogueJob = await prisma.catalogueJob.findUnique({ where: { id: jobId } });
  if (!catalogueJob) return;

  if (queueJob.name === "catalogue") {
    if (catalogueJob.status === "done") return;
    const { admin } = await unauthenticated.admin(catalogueJob.shop);
    await runJob(jobId, admin);
    return;
  }

  if (queueJob.name === "flipbook") {
    if (catalogueJob.flipbookStatus === "done") return;
    await runFlipbookJob(jobId);
    return;
  }

  throw new Error(`Type de job inconnu : ${queueJob.name}`);
}

async function recoverIncompleteJobs() {
  const jobs = await prisma.catalogueJob.findMany({
    where: {
      OR: [
        { status: { in: ["pending", "running"] } },
        { status: "done", flipbookStatus: { in: ["pending", "running"] } },
      ],
    },
  });

  for (const job of jobs) {
    if (job.status === "pending" || job.status === "running") await enqueueCatalogueJob(job.id);
    if (job.status === "done" && ["pending", "running"].includes(job.flipbookStatus)) {
      await enqueueFlipbookJob(job.id);
    }
  }

  if (jobs.length) logger.info("worker_incomplete_jobs_requeued", { count: jobs.length });
}

export async function startWorker() {
  if (worker) return worker;

  worker = new Worker(QUEUE_NAME, processJob, {
    connection: getQueueConnection(),
    concurrency: 1,
  });
  worker.on("failed", (job, error) => {
    reportError("worker_job_failed", error, { queueJobId: job?.id ?? "unknown", jobType: job?.name ?? "unknown" });
  });
  worker.on("error", (error) => reportError("worker_redis_error", error));
  await recoverIncompleteJobs();
  logger.info("worker_ready");
  return worker;
}
