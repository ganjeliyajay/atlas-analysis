export type RetentionPeriod = "daily" | "weekly" | "monthly";

export type RetentionAggregateRow = {
  cohortStart: string;
  periodIndex: number;
  totalUsers: number | bigint;
  retainedUsers: number | bigint;
};

export type RetentionCohortData = {
  cohortDate: string;
  totalUsers: number;
  periods: (number | null)[];
  retainedCounts: (number | null)[];
};

export function addRetentionPeriods(
  date: Date,
  count: number,
  period: RetentionPeriod,
): Date {
  const result = new Date(date);
  if (period === "daily") result.setUTCDate(result.getUTCDate() + count);
  else if (period === "weekly") result.setUTCDate(result.getUTCDate() + count * 7);
  else result.setUTCMonth(result.getUTCMonth() + count);
  return result;
}

function formatBucket(date: Date, period: RetentionPeriod): string {
  if (period === "monthly") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

export function buildRetentionCohorts(
  rows: RetentionAggregateRow[],
  period: RetentionPeriod,
  now: Date,
  periodCount = 8,
): RetentionCohortData[] {
  const cohortMap = new Map<string, RetentionCohortData>();

  for (const row of rows) {
    const cohortStartDate = new Date(`${row.cohortStart.replace(" ", "T")}Z`);
    if (!Number.isFinite(cohortStartDate.getTime())) continue;

    const cohortDate = formatBucket(cohortStartDate, period);
    let cohort = cohortMap.get(cohortDate);

    if (!cohort) {
      cohort = {
        cohortDate,
        totalUsers: Number(row.totalUsers),
        periods: Array(periodCount).fill(null) as (number | null)[],
        retainedCounts: Array(periodCount).fill(null) as (number | null)[],
      };
      cohortMap.set(cohortDate, cohort);
    }

    const index = Number(row.periodIndex);
    if (!Number.isInteger(index) || index < 0 || index >= periodCount) continue;

    const retained = Number(row.retainedUsers);
    const periodEnd = addRetentionPeriods(cohortStartDate, index + 1, period);
    if (index === 0 || periodEnd <= now) {
      cohort.retainedCounts[index] = retained;
      cohort.periods[index] = cohort.totalUsers > 0
        ? Number(((retained / cohort.totalUsers) * 100).toFixed(2))
        : 0;
    }
  }

  return Array.from(cohortMap.values()).sort((a, b) =>
    a.cohortDate.localeCompare(b.cohortDate),
  );
}

export function summarizeRetention(
  cohorts: RetentionCohortData[],
  period: RetentionPeriod,
  periodCount = 8,
) {
  const retentionAt = (offset: number) => {
    let eligibleUsers = 0;
    let retainedUsers = 0;
    for (const cohort of cohorts) {
      const count = cohort.retainedCounts[offset];
      if (count === null || count === undefined) continue;
      eligibleUsers += cohort.totalUsers;
      retainedUsers += count;
    }
    return eligibleUsers > 0
      ? Number(((retainedUsers / eligibleUsers) * 100).toFixed(2))
      : 0;
  };

  const retentionCurve = Array.from({ length: periodCount }, (_, index) => {
    let eligibleUsers = 0;
    let retainedUsers = 0;
    for (const cohort of cohorts) {
      const count = cohort.retainedCounts[index];
      if (count === null || count === undefined) continue;
      eligibleUsers += cohort.totalUsers;
      retainedUsers += count;
    }

    return {
      label: period === "daily" ? `Day ${index}` : period === "weekly" ? `Week ${index}` : `Month ${index}`,
      date: String(index),
      value: eligibleUsers > 0
        ? Number(((retainedUsers / eligibleUsers) * 100).toFixed(2))
        : 0,
    };
  });

  return {
    period1Retention: retentionAt(1),
    period2Retention: retentionAt(2),
    period4Retention: retentionAt(4),
    retentionCurve,
    averageCohortSize: cohorts.length > 0
      ? Number((cohorts.reduce((sum, cohort) => sum + cohort.totalUsers, 0) / cohorts.length).toFixed(2))
      : 0,
    totalUsers: cohorts.reduce((sum, cohort) => sum + cohort.totalUsers, 0),
    totalCohorts: cohorts.length,
  };
}
