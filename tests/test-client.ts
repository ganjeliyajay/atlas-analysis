import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { validateDatabaseUrl } from "@/tests/database-safety";

/**
 * Dedicated test fixture client.
 * Strictly forbidden and never imported in production application code.
 * Used exclusively within tests/integration to provision test tenants,
 * users, and fixtures across isolation boundaries.
 * 
 * Safety invariants:
 * 1. DATABASE_URL_TEST_FIXTURES is strictly mandatory.
 * 2. Zero fallback to DATABASE_URL_MIGRATION, DATABASE_URL, or production credentials.
 * 3. Enforces host and database-name safety validation (fail closed).
 */
const fixtureConnection = process.env.DATABASE_URL_TEST_FIXTURES;

if (!fixtureConnection || fixtureConnection.trim() === "") {
  throw new Error(
    "[FATAL TEST SAFETY ERROR] DATABASE_URL_TEST_FIXTURES is mandatory for fixture operations. " +
    "Direct fallback to DATABASE_URL_MIGRATION or DATABASE_URL is strictly prohibited to prevent accidental fixture execution against non-test databases."
  );
}

// Validate database safety (host must be local, DB name must contain 'test')
validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", fixtureConnection);

const adapter = new PrismaPg({
  connectionString: fixtureConnection,
});

export const testFixturePrisma = new PrismaClient({
  adapter,
});
