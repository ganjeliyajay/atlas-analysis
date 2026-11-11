
import pg from "pg";

const { Pool } = pg;

const endpoint =
  process.env.ATLAS_ROLLUP_URL ??
  "http://localhost:3000/api/cron/rollups";

const secret = process.env.CRON_SECRET;
const connectionString = process.env.DATABASE_URL_OPS;

if (!secret) {
  throw new Error("Set CRON_SECRET in .env.");
}

if (!connectionString) {
  throw new Error("Set DATABASE_URL_OPS in .env.");
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 15000,
});

async function runJob(label) {
  console.log(`\n[${label}] Starting rollup job...`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `[${label}] Rollup job returned ${response.status}: ${responseText}`,
    );
  }

  const result = JSON.parse(responseText);

  console.log(`[${label}] Rollup job completed successfully.`);
  console.log(JSON.stringify(result, null, 2));

  return result;
}

async function checksum() {
  console.log("[CHECKSUM] Calculating rollup checksums...");

  const daily = await pool.query(`
    SELECT
      COUNT(*)::text AS row_count,
      COALESCE(
        bit_xor(
          hashtextextended(
            concat_ws(
              ':',
              "organizationId",
              "bucketStart"::text,
              "eventName",
              "eventCount"::text,
              "uniqueUsers"::text,
              "uniqueSessions"::text
            ),
            0
          )
        ),
        0
      )::text AS checksum
    FROM public.event_daily_rollups
  `);

  const hourly = await pool.query(`
    SELECT
      COUNT(*)::text AS row_count,
      COALESCE(
        bit_xor(
          hashtextextended(
            concat_ws(
              ':',
              "organizationId",
              "bucketStart"::text,
              "eventName",
              "eventCount"::text,
              "uniqueUsers"::text,
              "uniqueSessions"::text
            ),
            0
          )
        ),
        0
      )::text AS checksum
    FROM public.event_hourly_rollups
  `);

  const result = {
    daily: daily.rows[0],
    hourly: hourly.rows[0],
  };

  console.log("[CHECKSUM] Completed.");
  console.log(JSON.stringify(result, null, 2));

  return result;
}

try {
  console.log("==================================");
  console.log("ATLAS ROLLUP IDEMPOTENCY TEST");
  console.log("==================================");

  const firstRun = await runJob("FIRST RUN");

  const firstChecksum = await checksum();

  const secondRun = await runJob("SECOND RUN");

  const secondChecksum = await checksum();

  const valuesIdentical =
    firstChecksum.daily.row_count === secondChecksum.daily.row_count &&
    firstChecksum.daily.checksum === secondChecksum.daily.checksum &&
    firstChecksum.hourly.row_count === secondChecksum.hourly.row_count &&
    firstChecksum.hourly.checksum === secondChecksum.hourly.checksum;

  if (!valuesIdentical) {
    throw new Error(
      "Rollup values changed after rerunning the same job.",
    );
  }

  console.log("\n==================================");
  console.log("ROLLUP IDEMPOTENCY TEST PASSED");
  console.log("==================================");

  console.log(
    JSON.stringify(
      {
        success: true,
        firstRun,
        secondRun,
        valuesIdentical: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("\nROLLUP TEST FAILED:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
