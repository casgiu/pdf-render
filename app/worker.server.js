import { Worker } from "bullmq";
import prisma from "./db.server";
import { runFlipbookJob, runJob } from "./lib/catalogue-jobs.server";
import { enqueueCatalogueJob, enqueueFlipbookJob, getQueueConnection, QUEUE_NAME } from "./lib/job-queue.server";
import { unauthenticated } from "./shopify.server";

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

  if (jobs.length) console.log(`[worker] ${jobs.length} job(s) incomplet(s) remis en file.`);
}

export async function startWorker() {
  if (worker) return worker;

  worker = new Worker(QUEUE_NAME, processJob, {
    connection: getQueueConnection(),
    concurrency: 1,
  });
  worker.on("failed", (job, error) => {
    console.error(`[worker] job ${job?.id ?? "inconnu"} en échec :`, error);
  });
  worker.on("error", (error) => console.error("[worker] erreur Redis :", error));
  await recoverIncompleteJobs();
  console.log("[worker] prêt.");
  return worker;
}
