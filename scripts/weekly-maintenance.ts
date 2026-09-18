// Platform-independent weekly housekeeping + watchdog.
import "dotenv/config";
import { ensureSchema } from "../src/db/bootstrap";
import { runMaintenance } from "../src/lib/maintenance";
import { pool } from "../src/db";

async function main() {
  await ensureSchema();
  const report = await runMaintenance();
  console.log(JSON.stringify(report));
  if (!report.ok) {
    throw new Error(`Stale sources: ${report.staleSources.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
