import { reconcileObjectStorage } from "../app/lib/object-storage-reconciliation.server.js";

const dryRun = process.argv.includes("--dry-run");
const result = await reconcileObjectStorage({ dryRun });

console.log(JSON.stringify({ event: "object_storage_reconciliation", ...result }));
