import { PrismaClient } from "@prisma/client";
import { PrismaClient as LegacyPrismaClient } from "../generated/legacy-sqlite/index.js";

if (process.env.MIGRATE_SQLITE_TO_POSTGRES !== "true") {
  process.exit(0);
}

if (!process.env.LEGACY_SQLITE_DATABASE_URL) {
  throw new Error("LEGACY_SQLITE_DATABASE_URL est requis lorsque MIGRATE_SQLITE_TO_POSTGRES=true.");
}

const postgres = new PrismaClient();
const legacy = new LegacyPrismaClient();

async function copySessions() {
  const records = await legacy.session.findMany();
  for (const record of records) {
    await postgres.session.upsert({ where: { id: record.id }, update: record, create: record });
  }
  return records.length;
}

async function copyJobs() {
  const records = await legacy.catalogueJob.findMany();
  for (const record of records) {
    await postgres.catalogueJob.upsert({ where: { id: record.id }, update: record, create: record });
  }
  return records.length;
}

async function copyThemes() {
  const records = await legacy.catalogueTheme.findMany();
  for (const record of records) {
    await postgres.catalogueTheme.upsert({ where: { id: record.id }, update: record, create: record });
  }
  return records.length;
}

try {
  const [sessions, jobs, themes] = await Promise.all([copySessions(), copyJobs(), copyThemes()]);
  console.log(`Migration SQLite → Postgres terminée : ${sessions} sessions, ${jobs} catalogues, ${themes} thèmes.`);
} finally {
  await Promise.all([postgres.$disconnect(), legacy.$disconnect()]);
}
