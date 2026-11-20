/**
 * Production Database Safety Boundary for Automated Test Suites.
 * 
 * Enforces strict fail-closed validation on all PostgreSQL connection URLs:
 * 1. Database name must explicitly contain 'test' or 'testing'.
 * 2. Host must be strictly loopback/localhost (127.0.0.1, localhost, ::1).
 * 3. Any attempt to connect to production, remote hosts, or non-test databases fails closed immediately.
 */

export const ALLOWED_TEST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export interface DatabaseValidationResult {
  valid: boolean;
  databaseName: string;
  host: string;
}

/**
 * Validates a PostgreSQL connection URL against strict test safety rules.
 * Throws an Error if the URL is invalid, points to a remote host, or targets a non-test database.
 */
export function validateDatabaseUrl(
  variableName: string,
  connectionString?: string | null
): DatabaseValidationResult {
  if (!connectionString || connectionString.trim() === "") {
    throw new Error(
      `[DATABASE SAFETY VIOLATION] ${variableName} is required but was empty or undefined.`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch (err) {
    throw new Error(
      `[DATABASE SAFETY VIOLATION] ${variableName} must be a valid PostgreSQL connection URL: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(
      `[DATABASE SAFETY VIOLATION] ${variableName} invalid protocol '${parsed.protocol}'. Expected postgres: or postgresql:`
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new Error(
      `[DATABASE SAFETY VIOLATION] ${variableName} connection URL is missing a hostname.`
    );
  }

  if (!ALLOWED_TEST_HOSTS.has(host)) {
    throw new Error(
      `[DATABASE SAFETY VIOLATION] ${variableName} targets remote host '${host}'. Automated tests are strictly restricted to local test environments (localhost, 127.0.0.1, ::1). Remote execution is prohibited.`
    );
  }

  const rawPath = parsed.pathname.replace(/^\//, "");
  const databaseName = decodeURIComponent(rawPath);

  if (!databaseName || databaseName.trim() === "") {
    throw new Error(
      `[DATABASE SAFETY VIOLATION] ${variableName} is missing a target database name.`
    );
  }

  if (!/(^|[_-])(test|testing)([_-]|$)/i.test(databaseName)) {
    throw new Error(
      `[DATABASE SAFETY VIOLATION] ${variableName} points to non-test database '${databaseName}'. Vitest and test fixtures are strictly restricted to dedicated test databases matching /(^|[_-])(test|testing)([_-]|$)/i.`
    );
  }

  return {
    valid: true,
    databaseName,
    host,
  };
}

export const MONITORED_DATABASE_VARIABLES = [
  "DATABASE_URL_APP",
  "DATABASE_URL_OPS",
  "DATABASE_URL_MIGRATION",
  "DATABASE_URL",
  "DATABASE_URL_TEST",
  "DATABASE_URL_TEST_FIXTURES",
] as const;

// Self-executing validation on load for active environment variables
for (const variable of MONITORED_DATABASE_VARIABLES) {
  const connectionString = process.env[variable];
  if (!connectionString) continue;
  validateDatabaseUrl(variable, connectionString);
}
