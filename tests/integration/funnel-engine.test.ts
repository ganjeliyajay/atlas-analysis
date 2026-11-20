import { describe, it, expect, beforeAll } from "vitest";
import { prismaOps } from "@/lib/prisma-ops";
import { testFixturePrisma } from "@/tests/test-client";
import { executePostgreSqlFunnel } from "@/lib/analytics/funnel-engine";

describe("Funnel Engine PostgreSQL CTE Integration Tests", () => {
  let testOrgId: string;
  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    let org = await testFixturePrisma.organization.findFirst({
      where: { slug: "funnel-test-org" },
    });

    if (!org) {
      let owner = await testFixturePrisma.user.findFirst();
      if (!owner) {
        owner = await testFixturePrisma.user.create({
          data: {
            email: `funnel-owner-${Date.now()}@test.com`,
            name: "Funnel Owner",
            password: "password123",
          },
        });
      }
      org = await testFixturePrisma.organization.create({
        data: {
          name: "Funnel Test Org",
          slug: "funnel-test-org",
          ownerId: owner.id,
        },
      });
    }
    testOrgId = org.id;

    // Create Project A
    let pA = await testFixturePrisma.project.findFirst({
      where: { organizationId: testOrgId, slug: "funnel-proj-a" },
    });
    if (!pA) {
      pA = await testFixturePrisma.project.create({
        data: {
          name: "Funnel Project A",
          slug: "funnel-proj-a",
          organizationId: testOrgId,
        },
      });
    }
    projectAId = pA.id;

    // Create Project B
    let pB = await testFixturePrisma.project.findFirst({
      where: { organizationId: testOrgId, slug: "funnel-proj-b" },
    });
    if (!pB) {
      pB = await testFixturePrisma.project.create({
        data: {
          name: "Funnel Project B",
          slug: "funnel-proj-b",
          organizationId: testOrgId,
        },
      });
    }
    projectBId = pB.id;

    const baseTime = new Date("2026-11-01T10:00:00Z");

    // Clean up previous test events
    await testFixturePrisma.analyticsEvent.deleteMany({
      where: {
        projectId: { in: [projectAId, projectBId] },
      },
    });

    // 1. User 1 converts through 3 steps in Project A
    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: projectAId,
          userId: "user_converted_1",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 1000),
        },
        {
          projectId: projectAId,
          userId: "user_converted_1",
          eventName: "step_mid",
          createdAt: new Date(baseTime.getTime() + 5000),
        },
        {
          projectId: projectAId,
          userId: "user_converted_1",
          eventName: "step_finish",
          createdAt: new Date(baseTime.getTime() + 10000),
        },
      ],
    });

    // 2. User 2 drops off after step 1
    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: projectAId,
          userId: "user_drop_2",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 2000),
        },
        {
          projectId: projectAId,
          userId: "user_drop_2",
          eventName: "step_mid",
          createdAt: new Date(baseTime.getTime() + 6000),
        },
      ],
    });

    // 3. User 3 has out-of-order events (finish before start)
    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: projectAId,
          userId: "user_outoforder_3",
          eventName: "step_finish",
          createdAt: new Date(baseTime.getTime() + 1000),
        },
        {
          projectId: projectAId,
          userId: "user_outoforder_3",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 8000),
        },
      ],
    });

    // 4. User 4 crosses projects: Step_start in Project A, but step_finish in Project B!
    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: projectAId,
          userId: "user_cross_project_4",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 3000),
        },
        {
          projectId: projectBId,
          userId: "user_cross_project_4",
          eventName: "step_mid",
          createdAt: new Date(baseTime.getTime() + 7000),
        },
        {
          projectId: projectBId,
          userId: "user_cross_project_4",
          eventName: "step_finish",
          createdAt: new Date(baseTime.getTime() + 12000),
        },
      ],
    });

    // 5. User 5: Identical timestamps for successive steps
    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: projectAId,
          userId: "user_equal_timestamps_5",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 4000),
        },
        {
          projectId: projectAId,
          userId: "user_equal_timestamps_5",
          eventName: "step_mid",
          createdAt: new Date(baseTime.getTime() + 4000), // Equal timestamp
        },
        {
          projectId: projectAId,
          userId: "user_equal_timestamps_5",
          eventName: "step_finish",
          createdAt: new Date(baseTime.getTime() + 4000), // Equal timestamp
        },
      ],
    });

    // 6. User 6: Repeated events at step 0 and step 1
    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: projectAId,
          userId: "user_repeated_6",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 500),
        },
        {
          projectId: projectAId,
          userId: "user_repeated_6",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 600),
        },
        {
          projectId: projectAId,
          userId: "user_repeated_6",
          eventName: "step_mid",
          createdAt: new Date(baseTime.getTime() + 700),
        },
        {
          projectId: projectAId,
          userId: "user_repeated_6",
          eventName: "step_mid",
          createdAt: new Date(baseTime.getTime() + 800),
        },
      ],
    });

    // 7. User 7: Missing intermediate step (does start and finish, skips mid)
    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: projectAId,
          userId: "user_missing_step_7",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 1500),
        },
        {
          projectId: projectAId,
          userId: "user_missing_step_7",
          eventName: "step_finish",
          createdAt: new Date(baseTime.getTime() + 2500),
        },
      ],
    });

    // 8. User 8: Complete 6-step journey
    const step6Names = ["s1", "s2", "s3", "s4", "s5", "s6"];
    for (let i = 0; i < 6; i++) {
      await testFixturePrisma.analyticsEvent.create({
        data: {
          projectId: projectAId,
          userId: "user_6step_8",
          eventName: step6Names[i]!,
          createdAt: new Date(baseTime.getTime() + (i + 1) * 1000),
        },
      });
    }

    // 9. User 9: Conversion window expiry
    // Window = 1 day (86400s). Step start on Nov 1 10:00, step finish on Nov 3 10:00 (exceeded)
    await testFixturePrisma.analyticsEvent.createMany({
      data: [
        {
          projectId: projectAId,
          userId: "user_window_expiry_9",
          eventName: "step_start",
          createdAt: new Date(baseTime.getTime() + 1000),
        },
        {
          projectId: projectAId,
          userId: "user_window_expiry_9",
          eventName: "step_mid",
          createdAt: new Date(baseTime.getTime() + 1000 + 48 * 3600 * 1000), // +48 hours
        },
      ],
    });
  });

  it("calculates 3-step funnel accurately with proper conversion and drop-off rates", async () => {
    const startDate = new Date("2026-11-01T00:00:00Z");
    const endDate = new Date("2026-11-02T00:00:00Z");

    const result = await executePostgreSqlFunnel(
      prismaOps,
      [projectAId],
      ["step_start", "step_mid", "step_finish"],
      startDate,
      endDate,
      7
    );

    expect(result.steps).toHaveLength(3);
    // step_start: user_converted_1, user_drop_2, user_outoforder_3, user_cross_project_4, user_equal_timestamps_5, user_repeated_6, user_missing_step_7, user_window_expiry_9 = 8 users
    expect(result.steps[0]?.users).toBe(8);
    // step_mid: user_converted_1, user_drop_2, user_equal_timestamps_5, user_repeated_6 = 4 users
    expect(result.steps[1]?.users).toBe(4);
    // step_finish: user_converted_1, user_equal_timestamps_5 = 2 users
    expect(result.steps[2]?.users).toBe(2);

    expect(result.totalUsers).toBe(8);
    expect(result.convertedUsers).toBe(2);
    expect(result.overallConversionRate).toBe(25);
    expect(result.overallDropOffRate).toBe(75);

    // Monotonically non-increasing assertion
    for (let i = 1; i < result.steps.length; i++) {
      expect(result.steps[i]!.users).toBeLessThanOrEqual(result.steps[i - 1]!.users);
    }
  });

  it("proves multi-project query does NOT cross-pollinate funnel steps across unrelated projects", async () => {
    const startDate = new Date("2026-11-01T00:00:00Z");
    const endDate = new Date("2026-11-02T00:00:00Z");

    const result = await executePostgreSqlFunnel(
      prismaOps,
      [projectAId, projectBId],
      ["step_start", "step_mid", "step_finish"],
      startDate,
      endDate,
      7
    );

    // user_cross_project_4 did step_start in A, but step_mid and step_finish in B.
    // user_cross_project_4 MUST NOT count as converted!
    expect(result.convertedUsers).toBe(2); // user_converted_1 and user_equal_timestamps_5
    expect(result.steps[2]?.users).toBe(2);
  });

  it("supports 2-step minimal funnels correctly", async () => {
    const startDate = new Date("2026-11-01T00:00:00Z");
    const endDate = new Date("2026-11-02T00:00:00Z");

    const result = await executePostgreSqlFunnel(
      prismaOps,
      [projectAId],
      ["step_start", "step_mid"],
      startDate,
      endDate,
      7
    );

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.users).toBe(8);
    expect(result.steps[1]?.users).toBe(4);
    expect(result.convertedUsers).toBe(4);
    expect(result.overallConversionRate).toBe(50);
  });

  it("supports 6-step maximum funnels correctly", async () => {
    const startDate = new Date("2026-11-01T00:00:00Z");
    const endDate = new Date("2026-11-02T00:00:00Z");

    const result = await executePostgreSqlFunnel(
      prismaOps,
      [projectAId],
      ["s1", "s2", "s3", "s4", "s5", "s6"],
      startDate,
      endDate,
      7
    );

    expect(result.steps).toHaveLength(6);
    expect(result.totalUsers).toBe(1);
    expect(result.convertedUsers).toBe(1);
    expect(result.overallConversionRate).toBe(100);
    for (const step of result.steps) {
      expect(step.users).toBe(1);
    }
  });

  it("enforces conversion window boundary strictly (1-day window drops 48h conversion)", async () => {
    const startDate = new Date("2026-11-01T00:00:00Z");
    const endDate = new Date("2026-11-05T00:00:00Z");

    // With 1 day window: user_window_expiry_9 must NOT convert to step_mid
    const result1d = await executePostgreSqlFunnel(
      prismaOps,
      [projectAId],
      ["step_start", "step_mid"],
      startDate,
      endDate,
      1
    );

    // With 7 days window: user_window_expiry_9 converts to step_mid (+48h <= 7d)
    const result7d = await executePostgreSqlFunnel(
      prismaOps,
      [projectAId],
      ["step_start", "step_mid"],
      startDate,
      endDate,
      7
    );

    expect(result1d.steps[1]?.users).toBe(4); // Excludes user_window_expiry_9
    expect(result7d.steps[1]?.users).toBe(5); // Includes user_window_expiry_9
  });

  it("respects exclusive end date properly", async () => {
    // End date before any events occur
    const earlyEnd = new Date("2026-11-01T10:00:00Z"); // baseTime
    const result = await executePostgreSqlFunnel(
      prismaOps,
      [projectAId],
      ["step_start", "step_mid"],
      new Date("2026-11-01T00:00:00Z"),
      earlyEnd,
      7
    );

    expect(result.totalUsers).toBe(0);
    expect(result.convertedUsers).toBe(0);
    expect(result.steps[0]?.users).toBe(0);
  });

  it("returns zero counts for an empty project or non-existent steps", async () => {
    const startDate = new Date("2026-11-01T00:00:00Z");
    const endDate = new Date("2026-11-02T00:00:00Z");

    const result = await executePostgreSqlFunnel(
      prismaOps,
      [projectAId],
      ["nonexistent_event_a", "nonexistent_event_b"],
      startDate,
      endDate,
      7
    );

    expect(result.totalUsers).toBe(0);
    expect(result.convertedUsers).toBe(0);
    expect(result.overallConversionRate).toBe(0);
    expect(result.steps[0]?.users).toBe(0);
    expect(result.steps[1]?.users).toBe(0);
  });
});
