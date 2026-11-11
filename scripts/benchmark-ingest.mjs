const endpoint = process.env.ATLAS_INGEST_URL ?? "http://localhost:3000/api/v1/events";
const apiKey = process.env.ATLAS_API_KEY;
const batchSize = Number.parseInt(process.env.INGEST_BATCH_SIZE ?? "100", 10);
const batches = Number.parseInt(process.env.INGEST_BATCHES ?? "100", 10);
const concurrency = Number.parseInt(process.env.INGEST_CONCURRENCY ?? "10", 10);

if (!apiKey) throw new Error("Set ATLAS_API_KEY to a valid ingestion key.");
if (![batchSize, batches, concurrency].every(Number.isSafeInteger) ||
  batchSize < 1 || batchSize > 500 || batches < 1 || concurrency < 1) {
  throw new Error("Invalid benchmark settings. Batch size must be 1-500.");
}

let nextBatch = 0;
let accepted = 0;
let failed = 0;
const startedAt = performance.now();

async function worker() {
  while (true) {
    const batchNumber = nextBatch;
    nextBatch += 1;
    if (batchNumber >= batches) return;

    const events = Array.from({ length: batchSize }, (_, index) => ({
      eventName: ["page_view", "signup_started", "purchase", "button_clicked"][
        (batchNumber * batchSize + index) % 4
      ],
      userId: `benchmark-user-${(batchNumber * batchSize + index) % 10000}`,
      sessionId: `benchmark-session-${(batchNumber * batchSize + index) % 20000}`,
      properties: { benchmark: true, sequence: batchNumber * batchSize + index },
    }));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `atlas-benchmark-${Date.now()}-${batchNumber}`,
        },
        body: JSON.stringify({ events }),
      });

      if (response.status === 202) {
        accepted += batchSize;
      } else {
        failed += batchSize;

        const responseBody = await response.text();

        console.error(`Batch ${batchNumber} failed:`, {
          status: response.status,
          body: responseBody,
          retryAfter: response.headers.get("Retry-After"),
          rateLimitLimit: response.headers.get("X-RateLimit-Limit"),
          rateLimitRemaining: response.headers.get("X-Ratelimit-Remaining"),
          quotaLimit: response.headers.get("X-Event-Quota-Limit"),
          quotaUsed: response.headers.get("X-Event-Quota-Used"),
          quotaRemaining: response.headers.get("X-Event-Quota-Remaining"),
        });
      }

    } catch (error) {
      failed += batchSize;
      process.stderr.write(`Batch ${batchNumber} failed: ${String(error)}\n`);
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, batches) }, () => worker()),
);

const seconds = (performance.now() - startedAt) / 1000;
const attempted = batches * batchSize;
console.log(JSON.stringify({
  endpoint,
  attempted,
  accepted,
  failed,
  durationSeconds: Number(seconds.toFixed(2)),
  eventsPerSecond: Math.round(accepted / seconds),
  targetEventsPerSecond: 200,
  targetMet: accepted === attempted && accepted / seconds >= 200,
}, null, 2));
