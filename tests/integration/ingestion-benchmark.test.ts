import { describe, it, expect } from "vitest";
import { prismaOps } from "@/lib/prisma-ops";
import { testFixturePrisma } from "@/tests/test-client";
import { POST } from "@/app/api/events/route";
import { generateApiKey } from "@/lib/api-keys";

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return Number(sorted[idx]!.toFixed(2));
}

describe("Comprehensive Ingestion & Rate-Limit Performance Benchmark", () => {
  it("executes single, batch, and concurrent direct-handler ingestion benchmarks and records percentiles", async () => {
    const ts = Date.now();
    let user: { id: string } | null = null;
    let org: { id: string } | null = null;
    let project: { id: string } | null = null;

    try {
      // 1. Provision isolated benchmark tenant and project
      user = await testFixturePrisma.user.create({
        data: {
          email: `bench-ingest-${ts}@atlas-perf.test`,
          name: "Perf Benchmark User",
          password: "perf_secure_password_123",
        },
      });

      org = await testFixturePrisma.organization.create({
        data: {
          name: "Benchmark Tenant",
          slug: `bench-org-${ts}`,
          ownerId: user.id,
          eventQuota: 500000,
          status: "active",
        },
      });

      project = await testFixturePrisma.project.create({
        data: {
          name: "Benchmark Project",
          slug: `bench-proj-${ts}`,
          organizationId: org.id,
        },
      });

    const keyGen = generateApiKey();
    const rawKey = keyGen.rawKey;

    await testFixturePrisma.apiKey.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        name: "Benchmark Key",
        keyPrefix: keyGen.keyPrefix,
        keyHash: keyGen.keyHash,
      },
    });

    const results: Record<string, unknown> = {};

    // --- SCENARIO 1: Single-event ingestion (50 sequential requests) ---
    const singleLatencies: number[] = [];
    let singleSuccess = 0;
    const singleStart = performance.now();

    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      const req = new Request("http://localhost:3000/api/v1/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventName: "bench_single_event",
          userId: `user-${i}`,
          sessionId: `sess-${i}`,
          properties: { seq: i, test: "single" },
        }),
      });

      const res = await POST(req);
      const t1 = performance.now();
      singleLatencies.push(t1 - t0);

      if (res.status === 202) {
        singleSuccess++;
      }
    }

    const singleDurationSec = (performance.now() - singleStart) / 1000;
    results.single = {
      totalRequests: 50,
      acceptedEvents: singleSuccess,
      durationSeconds: Number(singleDurationSec.toFixed(2)),
      eventsPerSecond: Math.round(singleSuccess / singleDurationSec),
      avgLatencyMs: Number((singleLatencies.reduce((a, b) => a + b, 0) / singleLatencies.length).toFixed(2)),
      p95LatencyMs: percentile(singleLatencies, 95),
      p99LatencyMs: percentile(singleLatencies, 99),
    };

    expect(singleSuccess).toBe(50);

    // --- SCENARIO 2: Batch Ingestion (10, 50, 100, 250, 500 events) ---
    const batchSizes = [10, 50, 100, 250, 500];
    results.batches = {};

    for (const bSize of batchSizes) {
      const bLatencies: number[] = [];
      let bAccepted = 0;
      const bStart = performance.now();

      for (let r = 0; r < 3; r++) {
        const events = Array.from({ length: bSize }, (_, idx) => ({
          eventName: "bench_batch_event",
          userId: `batch-user-${r}-${idx}`,
          sessionId: `batch-sess-${r}`,
          properties: { batchSize: bSize, index: idx },
        }));

        const t0 = performance.now();
        const req = new Request("http://localhost:3000/api/v1/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rawKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ events }),
        });

        const res = await POST(req);
        const t1 = performance.now();
        bLatencies.push(t1 - t0);

        if (res.status === 202) {
          const body = (await res.json()) as { accepted: number };
          bAccepted += body.accepted;
        }
      }

      const bDuration = (performance.now() - bStart) / 1000;
      (results.batches as Record<string, unknown>)[`batch_${bSize}`] = {
        batchesSent: 3,
        totalEvents: bSize * 3,
        acceptedEvents: bAccepted,
        durationSeconds: Number(bDuration.toFixed(2)),
        eventsPerSecond: Math.round(bAccepted / bDuration),
        avgLatencyMs: Number((bLatencies.reduce((a, b) => a + b, 0) / bLatencies.length).toFixed(2)),
        p95LatencyMs: percentile(bLatencies, 95),
      };

      expect(bAccepted).toBe(bSize * 3);
    }

    // --- SCENARIO 3: Concurrent Batch Ingestion (8 parallel workers sending 100-event batches) ---
    const concLatencies: number[] = [];
    let concAccepted = 0;
    const concStart = performance.now();

    const workers = Array.from({ length: 8 }, async (_, wId) => {
      const events = Array.from({ length: 100 }, (_, idx) => ({
        eventName: "bench_concurrent_event",
        userId: `conc-user-${wId}-${idx}`,
        sessionId: `conc-sess-${wId}`,
        properties: { worker: wId, idx },
      }));

      const t0 = performance.now();
      const req = new Request("http://localhost:3000/api/v1/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `conc-key-${wId}-${Date.now()}`,
        },
        body: JSON.stringify({ events }),
      });

      const res = await POST(req);
      const t1 = performance.now();
      concLatencies.push(t1 - t0);

      if (res.status === 202) {
        const body = (await res.json()) as { accepted: number };
        concAccepted += body.accepted;
      }
    });

    await Promise.all(workers);
    const concDuration = (performance.now() - concStart) / 1000;
    results.concurrent = {
      workers: 8,
      totalEventsAttempted: 800,
      acceptedEvents: concAccepted,
      durationSeconds: Number(concDuration.toFixed(2)),
      eventsPerSecond: Math.round(concAccepted / concDuration),
      avgLatencyMs: Number((concLatencies.reduce((a, b) => a + b, 0) / concLatencies.length).toFixed(2)),
      p95LatencyMs: percentile(concLatencies, 95),
      p99LatencyMs: percentile(concLatencies, 99),
    };

    expect(concAccepted).toBe(800);

    // --- SCENARIO 4: Security Invariants (Invalid Key, Oversized Payload, Idempotency) ---
    // Invalid key:
    const resBadKey = await POST(new Request("http://localhost:3000/api/v1/events", {
      method: "POST",
      headers: { Authorization: "Bearer ak_live_invalidkey00000000000000000000000000" },
      body: JSON.stringify({ eventName: "test" }),
    }));
    expect(resBadKey.status).toBe(401);

    // Oversized batch (>500):
    const resOversized = await POST(new Request("http://localhost:3000/api/v1/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ events: Array.from({ length: 501 }, () => ({ eventName: "overflow" })) }),
    }));
    expect(resOversized.status).toBe(400);

    // Idempotency replay (202 duplicate) and conflict (409):
    const idemKey = `idem-test-${Date.now()}`;
    const resIdem1 = await POST(new Request("http://localhost:3000/api/v1/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}`, "Content-Type": "application/json", "Idempotency-Key": idemKey },
      body: JSON.stringify({ events: [{ eventName: "first_payload" }] }),
    }));
    expect(resIdem1.status).toBe(202);

    const resIdem2 = await POST(new Request("http://localhost:3000/api/v1/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}`, "Content-Type": "application/json", "Idempotency-Key": idemKey },
      body: JSON.stringify({ events: [{ eventName: "first_payload" }] }),
    }));
    const idem2Body = (await resIdem2.json()) as { duplicate?: boolean };
    expect(resIdem2.status).toBe(202);
    expect(idem2Body.duplicate).toBe(true);

    const resIdemConflict = await POST(new Request("http://localhost:3000/api/v1/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${rawKey}`, "Content-Type": "application/json", "Idempotency-Key": idemKey },
      body: JSON.stringify({ events: [{ eventName: "conflicting_payload" }] }),
    }));
    expect(resIdemConflict.status).toBe(409);

    // Verify row count in database
    const totalInserted = await prismaOps.analyticsEvent.count({
      where: { projectId: project.id },
    });

    results.verifiedDbRows = totalInserted;
    console.log("INGESTION_BENCHMARK_RESULTS:", JSON.stringify(results, null, 2));
    } finally {
      // Safe try/finally cleanup: strictly delete only the provisioned test fixtures
      if (org?.id) {
        await testFixturePrisma.organization.delete({ where: { id: org.id } }).catch(() => {});
      }
      if (user?.id) {
        await testFixturePrisma.user.delete({ where: { id: user.id } }).catch(() => {});
      }
    }
  }, 60000);
});
