/**
 * AnalyticsEvent.createdAt is stored as TIMESTAMP WITHOUT TIME ZONE with a
 * UTC-by-convention value. PostgreSQL drivers may hydrate that value as a JS
 * Date in the Node process timezone. Rebuild the instant from the Date's local
 * wall-clock fields so serialization is stable on both UTC and non-UTC hosts.
 * Do not use this helper for TIMESTAMPTZ columns or newly-created JS dates.
 */
export function normalizeUtcNaiveTimestamp(value: Date): Date {
  return new Date(Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  ));
}

export function formatUtcNaiveTimestamp(value: Date): string {
  return normalizeUtcNaiveTimestamp(value).toISOString();
}
