
import { afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL_APP;

if (!connectionString) {
  throw new Error("DATABASE_URL_APP is required for RLS context tests");
}

const pool = new Pool({
  connectionString,
  max: 1,
});

async function rollbackSafely(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Ignore rollback errors when no transaction is active.
  }
}

describe("PostgreSQL RLS Context Leakage", () => {
  afterAll(async () => {
    await pool.end();
  });

  it(
    "must not leak tenant or user context across pooled transactions",
    async () => {
      let client: PoolClient | undefined;
      let backendPid: number | undefined;

      try {
        // First checkout from the pool.
        client = await pool.connect();

        // Transaction A: set Tenant A and User A context.
        await client.query("BEGIN");

        const firstConnection = await client.query(
          `SELECT
             pg_backend_pid() AS backend_pid,
             current_user AS role_name`,
        );

        backendPid = Number(firstConnection.rows[0]?.backend_pid);

        expect(firstConnection.rows[0]?.role_name).toBe("atlas_app");

        await client.query(
          `SELECT set_config('app.tenant_id', $1, true)`,
          ["tenant-a-test-context"],
        );

        await client.query(
          `SELECT set_config('app.user_id', $1, true)`,
          ["user-a-test-context"],
        );

        const contextA = await client.query(
          `SELECT
             current_setting('app.tenant_id', true) AS tenant_id,
             current_setting('app.user_id', true) AS user_id`,
        );

        expect(contextA.rows[0]?.tenant_id).toBe("tenant-a-test-context");
        expect(contextA.rows[0]?.user_id).toBe("user-a-test-context");

        // Commit: transaction-local settings must be cleared.
        await client.query("COMMIT");

        // Release and acquire again.
        client.release();
        client = undefined;

        client = await pool.connect();

        // max: 1 should reuse the same physical PostgreSQL connection.
        const secondConnection = await client.query(
          `SELECT pg_backend_pid() AS backend_pid`,
        );

        expect(Number(secondConnection.rows[0]?.backend_pid)).toBe(
          backendPid,
        );

        // Transaction B: previous context must not be visible.
        await client.query("BEGIN");

        const contextAfterCommit = await client.query(
          `SELECT
             NULLIF(current_setting('app.tenant_id', true), '') AS tenant_id,
             NULLIF(current_setting('app.user_id', true), '') AS user_id`,
        );

        expect(contextAfterCommit.rows[0]?.tenant_id ?? null).toBeNull();
        expect(contextAfterCommit.rows[0]?.user_id ?? null).toBeNull();

        // Set another context, then rollback.
        await client.query(
          `SELECT set_config('app.tenant_id', $1, true)`,
          ["tenant-b-test-context"],
        );

        await client.query(
          `SELECT set_config('app.user_id', $1, true)`,
          ["user-b-test-context"],
        );

        const contextB = await client.query(
          `SELECT
             current_setting('app.tenant_id', true) AS tenant_id,
             current_setting('app.user_id', true) AS user_id`,
        );

        expect(contextB.rows[0]?.tenant_id).toBe("tenant-b-test-context");
        expect(contextB.rows[0]?.user_id).toBe("user-b-test-context");

        await client.query("ROLLBACK");

        // Transaction C: verify rollback also clears the context.
        client.release();
        client = undefined;

        client = await pool.connect();

        const thirdConnection = await client.query(
          `SELECT pg_backend_pid() AS backend_pid`,
        );

        expect(Number(thirdConnection.rows[0]?.backend_pid)).toBe(
          backendPid,
        );

        await client.query("BEGIN");

        const contextAfterRollback = await client.query(
          `SELECT
             NULLIF(current_setting('app.tenant_id', true), '') AS tenant_id,
             NULLIF(current_setting('app.user_id', true), '') AS user_id`,
        );

        expect(contextAfterRollback.rows[0]?.tenant_id ?? null).toBeNull();
        expect(contextAfterRollback.rows[0]?.user_id ?? null).toBeNull();

        await client.query("ROLLBACK");
      } finally {
        if (client) {
          await rollbackSafely(client);
          client.release();
        }
      }
    },
    30000,
  );
});

