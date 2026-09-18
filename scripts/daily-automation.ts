// Platform-independent daily worker.
// Runs from GitHub Actions even if the web host's own cron is unavailable.
import "dotenv/config";
import { ensureSchema } from "../src/db/bootstrap";
import { ALL_SOURCES, runIngest } from "../src/lib/ingest-run";
import { runDigest } from "../src/lib/digest";
import { pool } from "../src/db";

async function main() {
  await ensureSchema();
  const results = [];
  for (const source of ALL_SOURCES) {
    const result = await runIngest(source);
    results.push(result);
    console.log(JSON.stringify({ step: "ingest", ...result }));
  }

  const digest = await runDigest();
  console.log(JSON.stringify({ step: "digest", ...digest }));

  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    throw new Error(
      `${failures.length} source(s) failed: ${failures.map((f) => f.source).join(", ")}`
    );
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
