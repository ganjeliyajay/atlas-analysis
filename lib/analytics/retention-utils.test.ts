import { describe, expect, it } from "vitest";
import {
  buildRetentionCohorts,
  summarizeRetention,
  type RetentionAggregateRow,
} from "./retention-utils";

describe("Retention cohort aggregation", () => {
  it("uses UTC Monday-start weekly cohorts and weights retention by cohort size", () => {
    const rows: RetentionAggregateRow[] = [
      { cohortStart: "2026-10-05 00:00:00", periodIndex: 0, totalUsers: BigInt(10), retainedUsers: BigInt(10) },
      { cohortStart: "2026-10-05 00:00:00", periodIndex: 1, totalUsers: BigInt(10), retainedUsers: BigInt(6) },
      { cohortStart: "2026-10-05 00:00:00", periodIndex: 2, totalUsers: BigInt(10), retainedUsers: BigInt(4) },
      { cohortStart: "2026-10-05 00:00:00", periodIndex: 4, totalUsers: BigInt(10), retainedUsers: BigInt(2) },
      { cohortStart: "2026-11-02 00:00:00", periodIndex: 0, totalUsers: BigInt(30), retainedUsers: BigInt(30) },
      { cohortStart: "2026-11-02 00:00:00", periodIndex: 1, totalUsers: BigInt(30), retainedUsers: BigInt(20) },
    ];

    const now = new Date("2026-11-12T12:00:00.000Z");
    const cohorts = buildRetentionCohorts(rows, "weekly", now);
    const summary = summarizeRetention(cohorts, "weekly");

    expect(cohorts.map((cohort) => cohort.cohortDate)).toEqual([
      "2026-10-05",
      "2026-11-02",
    ]);
    expect(cohorts[1]?.periods[1]).toBeNull();
    expect(summary.period1Retention).toBe(60);
    expect(summary.period2Retention).toBe(40);
    expect(summary.period4Retention).toBe(20);
    expect(summary.totalUsers).toBe(40);
    expect(summary.totalCohorts).toBe(2);
  });

  it("marks unfinished daily and monthly periods as null", () => {
    const now = new Date("2026-11-12T12:00:00.000Z");
    const daily = buildRetentionCohorts([
      { cohortStart: "2026-11-12 00:00:00", periodIndex: 0, totalUsers: 4, retainedUsers: 4 },
      { cohortStart: "2026-11-12 00:00:00", periodIndex: 1, totalUsers: 4, retainedUsers: 2 },
    ], "daily", now);

    const monthly = buildRetentionCohorts([
      { cohortStart: "2026-11-01 00:00:00", periodIndex: 0, totalUsers: 5, retainedUsers: 5 },
      { cohortStart: "2026-11-01 00:00:00", periodIndex: 1, totalUsers: 5, retainedUsers: 3 },
    ], "monthly", now);

    expect(daily[0]?.periods[0]).toBe(100);
    expect(daily[0]?.periods[1]).toBeNull();
    expect(monthly[0]?.periods[1]).toBeNull();
  });

  it("returns zero-safe retention metrics for an empty cohort set", () => {
    const summary = summarizeRetention([], "weekly");
    expect(summary.period1Retention).toBe(0);
    expect(summary.period4Retention).toBe(0);
    expect(summary.averageCohortSize).toBe(0);
    expect(summary.totalUsers).toBe(0);
  });
});
