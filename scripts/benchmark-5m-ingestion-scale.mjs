import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateApiKey } from '../lib/api-keys.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Safety: Database and Host Allowlists
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'test-postgres']);
const DISALLOWED_DB_KEYWORDS = ['prod', 'production', 'live'];

// Read strictly from environment variables — zero hardcoded credentials
const rawConnStr =
  process.env.DATABASE_URL_BENCH ||
  process.env.DATABASE_URL_OPS ||
  process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL;

if (!rawConnStr) {
  console.error('\n[FATAL CONFIGURATION ERROR] No database connection string provided.');
  console.error('Set DATABASE_URL_BENCH, DATABASE_URL_OPS, DATABASE_URL_TEST, or DATABASE_URL before running.');
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(rawConnStr);
} catch {
  console.error('[FATAL SAFETY ERROR] Invalid DATABASE connection URL provided.');
  process.exit(1);
}

const dbHost = (parsedUrl.hostname || 'localhost').toLowerCase();
const dbName = (parsedUrl.pathname.replace(/^\//, '') || '').toLowerCase();
const dbUser = (parsedUrl.username || '').toLowerCase();

// 1. Host allowlist validation
if (!ALLOWED_HOSTS.has(dbHost)) {
  console.error(`\n[FATAL SAFETY BLOCK] Large-scale benchmark aborted: Remote/Production host "${dbHost}" is prohibited.`);
  process.exit(1);
}

// 2. Reject production database names
if (DISALLOWED_DB_KEYWORDS.some((kw) => dbName.includes(kw))) {
  console.error(`\n[FATAL SAFETY BLOCK] Benchmark aborted: Database name "${dbName}" indicates a production environment.`);
  process.exit(1);
}

// 3. Reject superuser roles
if (dbUser === 'postgres' || dbUser === 'root' || dbUser === 'admin') {
  console.error(`\n[FATAL SAFETY BLOCK] Benchmark aborted: Superuser role "${dbUser}" is prohibited. Use restricted role "atlas_ops" or "atlas_app".`);
  process.exit(1);
}

// 4. Require explicit safety confirmation
const isDedicatedTestDb = dbName.endsWith('_test') || dbName.endsWith('_bench') || dbName.endsWith('_ci');
const hasSafetyConfirmation =
  process.env.ATLAS_BENCHMARK_CONFIRM === '1' ||
  process.argv.includes('--confirm-safety') ||
  process.env.NODE_ENV === 'test';

if (!isDedicatedTestDb && !hasSafetyConfirmation) {
  console.error(`\n[FATAL SAFETY BLOCK] Benchmark aborted: Target database "${dbName}" requires explicit confirmation.`);
  console.error('Pass --confirm-safety or set ATLAS_BENCHMARK_CONFIRM=1 to proceed.');
  process.exit(1);
}

// Configuration options
const args = process.argv.slice(2);
function getArgVal(name, defaultVal) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultVal;
}

const TARGET_EVENTS = Number(process.env.TARGET_EVENTS || getArgVal('--target-events', '5000000'));
const SLICE_EVENTS = Number(process.env.SLICE_EVENTS || getArgVal('--slice-events', '5000'));
const BATCH_SIZE = Math.min(Number(process.env.BATCH_SIZE || getArgVal('--batch-size', '500')), 500);
const CONCURRENCY = Number(process.env.CONCURRENCY || getArgVal('--concurrency', '8'));
const IS_SLICE_MODE = args.includes('--slice-mode') || !args.includes('--full-5m');
const INGEST_URL = process.env.ATLAS_INGEST_URL || 'http://localhost:3000/api/v1/events';

// Validate parameters
if (!Number.isInteger(TARGET_EVENTS) || TARGET_EVENTS <= 0 || TARGET_EVENTS > 10000000) {
  console.error('[FATAL CONFIG ERROR] TARGET_EVENTS must be a positive integer <= 10,000,000.');
  process.exit(1);
}
if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE <= 0 || BATCH_SIZE > 500) {
  console.error('[FATAL CONFIG ERROR] BATCH_SIZE must be an integer between 1 and 500.');
  process.exit(1);
}
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY <= 0 || CONCURRENCY > 32) {
  console.error('[FATAL CONFIG ERROR] CONCURRENCY must be an integer between 1 and 32.');
  process.exit(1);
}

// Ingestion URL validation
let parsedIngestUrl;
try {
  parsedIngestUrl = new URL(INGEST_URL);
} catch {
  console.error('[FATAL] Invalid INGEST_URL provided:', INGEST_URL);
  process.exit(1);
}
const ingestHost = parsedIngestUrl.hostname.toLowerCase();
if (!['http:', 'https:'].includes(parsedIngestUrl.protocol) || parsedIngestUrl.username || parsedIngestUrl.password || !ALLOWED_HOSTS.has(ingestHost)) {
  console.error(`\n[FATAL SAFETY BLOCK] Ingestion host "${ingestHost}" is not allowed. Only local hosts permitted.`);
  process.exit(1);
}

const totalEventsToIngest = IS_SLICE_MODE ? SLICE_EVENTS : TARGET_EVENTS;
const checkpointPath = path.join(projectRoot, 'docs', 'perf', 'ingestion-5m-checkpoint.json');

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return Number(sorted[idx].toFixed(2));
}

async function isServerRunning(url) {
  try {
    const res = await fetch(url);
    return res.status < 500;
  } catch {
    return false;
  }
}

function generateBatch(count, projectId) {
  const events = [];
  const now = new Date();
  const eventTypes = ['pageview', 'signup', 'click', 'search', 'checkout', 'export', 'dashboard_view'];

  for (let i = 0; i < count; i++) {
    events.push({
      eventName: eventTypes[i % eventTypes.length],
      userId: `bench_user_${Math.floor(i / 10)}`,
      sessionId: `bench_sess_${Math.floor(i / 20)}`,
      timestamp: new Date(now.getTime() - (count - i) * 100).toISOString(),
      properties: {
        batchIdx: i,
        source: 'benchmark-5m-scale',
        speed: 'high',
      },
    });
  }
  return { projectId, events };
}

async function main() {
  const client = new pg.Client({ connectionString: rawConnStr });
  await client.connect();

  console.log('================================================================');
  console.log('ATLAS ANALYTICS — 5M+ SCALE INGESTION BENCHMARK HARNESS');
  console.log('================================================================\n');
  console.log(`Target Database:  "${dbName}" on host "${dbHost}"`);
  console.log(`Ingestion URL:    ${INGEST_URL}`);
  console.log(`Mode:             ${IS_SLICE_MODE ? 'REPRESENTATIVE SLICE VALIDATION' : 'FULL 5M EXECUTION'}`);
  console.log(`Target Events:    ${totalEventsToIngest.toLocaleString()}`);
  console.log(`Batch Size:       ${BATCH_SIZE} events / batch`);
  console.log(`Concurrency:      ${CONCURRENCY} concurrent workers`);

  // Assert user is not superuser
  const superCheck = await client.query('SELECT usesuper FROM pg_user WHERE usename = current_user;');
  if (superCheck.rows.length > 0 && superCheck.rows[0].usesuper) {
    console.error('\n[FATAL SAFETY BLOCK] Database role possesses SUPERUSER privileges. Aborting benchmark.');
    await client.end();
    process.exit(1);
  }

  // Verify server
  const serverUp = await isServerRunning(INGEST_URL);
  if (!serverUp) {
    console.error(`\n[FATAL] Target application server is offline at ${INGEST_URL}.`);
    console.error('Please ensure the Next.js production server is running ("npm run start").');
    await client.end();
    process.exit(1);
  }

  // Baseline database row count
  const baselineRes = await client.query('SELECT count(*)::bigint AS cnt FROM "AnalyticsEvent";');
  const baselineRows = Number(baselineRes.rows[0].cnt);
  console.log(`Baseline Database AnalyticsEvent Count: ${baselineRows.toLocaleString()} rows`);

  const runId = Date.now();
  const testEmail = `bench_scale_${runId}@atlas-perf.test`;
  const orgSlug = `bench-scale-org-${runId}`;
  const projSlug = `bench-scale-proj-${runId}`;

  let createdOrgId = null;
  let createdUserId = null;
  let createdProjectId = null;
  let rawKey = null;

  // Interruption and tracking state
  let isShuttingDown = false;
  let inFlightCount = 0;
  let totalAccepted = 0;
  let totalRejected = 0;
  const latencies = [];
  let benchmarkStartTime = performance.now();
  let workersPromise = null;
  let interruptRequested = false;

  const persistCheckpoint = (status) => {
    try {
      const elapsed = (performance.now() - benchmarkStartTime) / 1000;
      const throughput = elapsed > 0 ? Math.round(totalAccepted / elapsed) : 0;
      const checkpoint = {
        timestamp: new Date().toISOString(),
        mode: IS_SLICE_MODE ? 'slice_validation' : 'full_scale',
        targetEvents: totalEventsToIngest,
        acceptedEvents: totalAccepted,
        rejectedEvents: totalRejected,
        durationSeconds: Number(elapsed.toFixed(2)),
        throughputEps: throughput,
        avgLatencyMs: Number((latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)).toFixed(2)),
        p95LatencyMs: percentile(latencies, 95),
        p99LatencyMs: percentile(latencies, 99),
        concurrency: CONCURRENCY,
        batchSize: BATCH_SIZE,
        full5MProjectedDurationMinutes: throughput > 0 ? Number(((5000000 / throughput) / 60).toFixed(1)) : null,
        status,
      };
      const checkpointDir = path.dirname(checkpointPath);
      if (!fs.existsSync(checkpointDir)) fs.mkdirSync(checkpointDir, { recursive: true });
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
      console.log(`[CHECKPOINT] State successfully persisted to ${checkpointPath}`);
      return true;
    } catch (err) {
      console.error('[CHECKPOINT ERROR] Failed to write checkpoint:', err.message);
      throw err;
    }
  };

  const handleInterrupt = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    interruptRequested = true;
    console.log('\n[NOTICE] Interrupt received. New batches stopped; active HTTP requests will drain before teardown.');
  };

  process.on('SIGINT', handleInterrupt);
  process.on('SIGTERM', handleInterrupt);

  try {
    console.log('\n1. Provisioning isolated benchmark infrastructure...');

    const userRes = await client.query(`
      INSERT INTO "User" (id, email, name, password, role, "createdAt")
      VALUES (gen_random_uuid(), $1, 'Scale Benchmark User', 'hash', 'owner', NOW())
      RETURNING id;
    `, [testEmail]);
    createdUserId = userRes.rows[0].id;

    const orgRes = await client.query(`
      INSERT INTO "Organization" (id, name, slug, "ownerId", "eventQuota", status, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), 'Scale Benchmark Tenant', $1, $2, 100000000, 'active', NOW(), NOW())
      RETURNING id;
    `, [orgSlug, createdUserId]);
    createdOrgId = orgRes.rows[0].id;

    await client.query(`
      INSERT INTO "OrganizationMember" (id, "organizationId", "userId", role, "createdAt")
      VALUES (gen_random_uuid(), $1, $2, 'owner', NOW());
    `, [createdOrgId, createdUserId]);

    const projRes = await client.query(`
      INSERT INTO "Project" (id, name, slug, "organizationId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), 'Scale Benchmark Project', $1, $2, NOW(), NOW())
      RETURNING id;
    `, [projSlug, createdOrgId]);
    createdProjectId = projRes.rows[0].id;

    const keyData = generateApiKey();
    rawKey = keyData.rawKey;

    await client.query(`
      INSERT INTO "api_keys" (id, "organizationId", "projectId", name, "keyPrefix", "keyHash", "createdAt")
      VALUES (gen_random_uuid(), $1, $2, 'Scale Key', $3, $4, NOW());
    `, [createdOrgId, createdProjectId, keyData.keyPrefix, keyData.keyHash]);

    console.log(`   -> Isolated Organization ID: ${createdOrgId}`);
    console.log(`   -> Isolated Project ID:      ${createdProjectId}`);

    console.log('\n2. Starting HTTP ingestion worker pool...');
    benchmarkStartTime = performance.now();
    const totalBatches = Math.ceil(totalEventsToIngest / BATCH_SIZE);
    let batchIndex = 0;

    async function runWorker(workerId) {
      while (batchIndex < totalBatches && !isShuttingDown) {
        const currentBatch = batchIndex++;
        const count = Math.min(BATCH_SIZE, totalEventsToIngest - currentBatch * BATCH_SIZE);
        if (count <= 0) break;

        const payload = generateBatch(count, createdProjectId);
        const reqStart = performance.now();
        inFlightCount++;

        try {
          const res = await fetch(INGEST_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${rawKey}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120000),
          });

          const duration = performance.now() - reqStart;
          latencies.push(duration);

          let body;
          try {
            body = await res.json();
          } catch {
            throw new Error(`Ingestion API returned non-JSON response (HTTP ${res.status})`);
          }
          if (res.status !== 202 || !Number.isInteger(body?.accepted) || body.accepted < 0 || body.accepted > count) {
            throw new Error(`Invalid ingestion response: HTTP ${res.status}; accepted count must be an integer between 0 and ${count}`);
          }
          const rejected = Number.isInteger(body.rejected) ? body.rejected : count - body.accepted;
          if (rejected < 0 || body.accepted + rejected !== count) {
            throw new Error(`Ingestion response counts do not reconcile for batch of ${count}`);
          }
          totalAccepted += body.accepted;
          totalRejected += rejected;
        } catch (err) {
          totalRejected += count;
          console.error(`[BATCH ${currentBatch + 1}] Rejected: ${err.message}`);
        } finally {
          inFlightCount--;
        }

        // Periodic progress log
        if (currentBatch > 0 && currentBatch % 5 === 0) {
          const elapsed = (performance.now() - benchmarkStartTime) / 1000;
          const currentEps = Math.round(totalAccepted / elapsed);
          console.log(`   [Progress] Ingested ${totalAccepted.toLocaleString()} / ${totalEventsToIngest.toLocaleString()} events (${currentEps} eps)`);
        }
      }
    }

    const workers = [];
    for (let w = 0; w < CONCURRENCY; w++) workers.push(runWorker(w));
    workersPromise = Promise.all(workers);
    await workersPromise;
    if (interruptRequested) throw new Error('Benchmark interrupted by operator after active requests drained.');

    const totalDurationSec = (performance.now() - benchmarkStartTime) / 1000;
    const throughputEps = Math.round(totalAccepted / totalDurationSec);
    const avgLatency = Number((latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)).toFixed(2));
    const p95Latency = percentile(latencies, 95);
    const p99Latency = percentile(latencies, 99);

    console.log('\n======================================================');
    console.log('INGESTION HARNESS BENCHMARK RESULTS');
    console.log('======================================================');
    console.log(`Total Events Attempted: ${totalEventsToIngest.toLocaleString()}`);
    console.log(`Accepted Events:        ${totalAccepted.toLocaleString()}`);
    console.log(`Rejected Events:        ${totalRejected.toLocaleString()}`);
    console.log(`Total Duration:         ${totalDurationSec.toFixed(2)} seconds`);
    console.log(`Throughput:             ${throughputEps.toLocaleString()} events/sec`);
    console.log(`Average Latency:        ${avgLatency} ms`);
    console.log(`p95 Latency:            ${p95Latency} ms`);
    console.log(`p99 Latency:            ${p99Latency} ms`);

    // Verify row count in database for the isolated project
    const rowCountRes = await client.query(
      'SELECT count(*)::bigint AS cnt FROM "AnalyticsEvent" WHERE "projectId" = $1;',
      [createdProjectId]
    );
    const verifiedDbRows = Number(rowCountRes.rows[0].cnt);
    console.log(`Verified DB Rows Inserted: ${verifiedDbRows.toLocaleString()}`);

    if (verifiedDbRows !== totalAccepted) {
      console.error(`\n[FATAL ROW MISMATCH] Database row count (${verifiedDbRows}) does not match accepted events (${totalAccepted})!`);
      throw new Error(`Row mismatch: DB ${verifiedDbRows} !== Accepted ${totalAccepted}`);
    }

    if (throughputEps > 0) {
      const full5MSeconds = Math.round(5000000 / throughputEps);
      const full5MMinutes = (full5MSeconds / 60).toFixed(1);
      console.log(`\n[5M SCALE PROJECTION BASED ON MEASURED THROUGHPUT]:`);
      console.log(`At measured ${throughputEps} eps, 5,000,000 events will take ~${full5MMinutes} minutes (~${full5MSeconds} seconds) and ~3.5 GB storage.`);
    }

    persistCheckpoint('SLICED_VERIFIED_FULL_5M_PENDING_CLUSTER');
    if (totalRejected > 0) throw new Error(`Benchmark had ${totalRejected} rejected events; refusing to report a clean pass.`);

  } finally {
    // Do not begin fixture teardown until all active worker requests have settled.
    if (workersPromise) await workersPromise;
    let teardownFailed = false;
    try {
      if (interruptRequested) persistCheckpoint('INTERRUPTED');
      if (createdOrgId) {
        console.log('\n3. Safe scoped teardown (Cleaning up benchmark tenant)...');
        await client.query('DELETE FROM "AnalyticsEvent" WHERE "projectId" = $1;', [createdProjectId]);
        await client.query('DELETE FROM "api_keys" WHERE "organizationId" = $1;', [createdOrgId]);
        await client.query('DELETE FROM "Project" WHERE "organizationId" = $1;', [createdOrgId]);
        await client.query('DELETE FROM "OrganizationMember" WHERE "organizationId" = $1;', [createdOrgId]);
        await client.query('DELETE FROM "Organization" WHERE id = $1;', [createdOrgId]);
        if (createdUserId) await client.query('DELETE FROM "User" WHERE id = $1;', [createdUserId]);

        const postCleanupRes = await client.query('SELECT count(*)::bigint AS cnt FROM "AnalyticsEvent";');
        const postCleanupRows = Number(postCleanupRes.rows[0].cnt);
        console.log(`   -> Post-cleanup verification: ${postCleanupRows.toLocaleString()} rows (Baseline: ${baselineRows.toLocaleString()})`);

        if (postCleanupRows !== baselineRows) {
          console.error(`\n[FATAL INTEGRITY VIOLATION] Baseline count modified! Expected ${baselineRows}, found ${postCleanupRows}.`);
          teardownFailed = true;
        } else {
          console.log('   -> [PASS] Database integrity verified: zero non-benchmark rows affected.');
        }
      }
    } catch (e) {
      console.error('[CLEANUP FAILURE]:', e.message);
      teardownFailed = true;
    } finally {
      await client.end();
      if (teardownFailed) process.exitCode = 1;
      if (interruptRequested && !teardownFailed) process.exitCode = 130;
    }
  }
}

main().catch((err) => {
  console.error('[Scale Benchmark Fatal Error]:', err);
  process.exit(1);
});
