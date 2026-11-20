# ATLAS Analytics — Production Deployment & Release Runbook

**Document Version**: 2.3.0 (Cloud Provider Feasibility & WAL Reality Hardened)  
**Date**: November 19, 2026  
**Provider Compatibility Status**:
- **Self-Hosted / Bare Metal / EC2 / Compute Engine (PostgreSQL 16/17 with `postgres` superuser)**: **SUPPORTED** (Admin: `postgres` native superuser with full `BYPASSRLS` delegation capability)
- **AWS RDS / Aurora PostgreSQL 16/17**: **INCOMPATIBLE with Custom Role `BYPASSRLS`** (`rds_superuser` does NOT possess `rolsuper` or `rolbypassrls`, and AWS restricts `BYPASSRLS` assignment strictly to internal `rdsadmin`. Standard customer admin cannot provision `atlas_function_owner BYPASSRLS`. Requires live staging validation to verify if any workaround exists; otherwise incompatible with current architecture)
- **GCP Cloud SQL PostgreSQL 16/17**: **INCOMPATIBLE with Custom Role `BYPASSRLS`** (`cloudsqlsuperuser` lacks `rolsuper` and `rolbypassrls`; cannot delegate `BYPASSRLS` to custom roles)
- **Neon Serverless PostgreSQL**: **INCOMPATIBLE / UNSUPPORTED** (`neondb_owner` lacks `BYPASSRLS` delegation rights)
- **Supabase Managed PostgreSQL**: **INCOMPATIBLE / UNSUPPORTED** (Restricts `BYPASSRLS` exclusively to internal platform roles)  

---

## 1. Environment Secrets & Runtime Configuration

### 1.1 Application Container Runtime (Least-Privilege Isolation)
The application container must receive **only** least-privileged application credentials. `DATABASE_URL_MIGRATION` or superuser credentials must **never** be injected into running application pods.

| Variable | Description | Required | Example / Security Constraints |
|:---|:---|:---:|:---|
| `NODE_ENV` | Runtime environment | **YES** | `production` |
| `DATABASE_URL_APP` | Application connection pool (`atlas_app` role) | **YES** | `postgresql://atlas_app:<app-pw>@<db-host>:5432/atlas_analytics` |
| `DATABASE_URL_OPS` | Operations connection pool (`atlas_ops` role) | **YES** | `postgresql://atlas_ops:<ops-pw>@<db-host>:5432/atlas_analytics` |
| `DATABASE_URL` | Fallback connection string (`atlas_app` role) | **YES** | Same as `DATABASE_URL_APP` |
| `AUTH_SECRET` | NextAuth encryption secret | **YES** | 32+ bytes high-entropy random string (`openssl rand -base64 32`) |
| `NEXTAUTH_SECRET` | Auth secret compatibility alias | **YES** | Same as `AUTH_SECRET` |
| `NEXTAUTH_URL` | Canonical origin for authentication callbacks | **YES** | `https://analytics.yourdomain.com` |
| `BASE_URL` | Application base URL | **YES** | `https://analytics.yourdomain.com` |
| `CRON_SECRET` | Secret token for rollup cron endpoint | **YES** | 32+ bytes high-entropy random string (`openssl rand -base64 32`) |
| `SENTRY_DSN` | Sentry performance & exception tracking | OPTIONAL | `https://<key>@o<org>.ingest.sentry.io/<project>` |
| `LOG_LEVEL` | Production log verbosity | OPTIONAL | `info` or `warn` |

### 1.2 CI/CD Deployment Hook Secrets (Isolated Runner Only)
These credentials exist exclusively within the CI/CD pipeline deployment job:

| Secret | Description | Used In |
|:---|:---|:---|
| `DATABASE_URL_MIGRATION` | Administrative connection for migrations | Tier 1, Tier 2, Tier 3 migration hooks only |
| `ATLAS_MIGRATOR_PASSWORD` | Password for `atlas_migrator` DDL role | Tier 1 role provisioning |
| `ATLAS_APP_PASSWORD` | Password for `atlas_app` runtime role | Tier 1 role provisioning |
| `ATLAS_OPS_PASSWORD` | Password for `atlas_ops` runtime role | Tier 1 role provisioning |

---

## 2. Pre-Deployment Database Backup & Safety Gate

Before initiating schema changes in production, execute a consistent snapshot:

1. **Point-in-Time Recovery (PITR) Snapshot**:
   - On AWS RDS / Aurora: Trigger a manual DB snapshot:
     ```bash
     aws rds create-db-snapshot --db-instance-identifier atlas-prod-db --db-snapshot-identifier atlas-pre-deploy-$(date +%Y%m%d%H%M)
     ```
   - On Neon: Create a point-in-time branch checkpoint.
   - On Google Cloud SQL: Trigger an on-demand backup.
2. **Logical PostgreSQL Dump**:
   ```bash
   pg_dump -h <db-host> -U postgres -d atlas_analytics -Fc -f atlas_pre_deploy_backup_$(date +%Y%m%d%H%M).dump
   ```

---

## 3. Three-Tier Migration Deployment Order

Execute database changes in this exact sequence:

```
[Tier 1: DBA Provisioning]  --->  [Tier 2: Schema Migrations]  --->  [Tier 3: Ownership Normalization]
npm run db:tier1                  npm run db:deploy                   npm run db:tier3
```

### Step 3.1: Tier 1 Database Role Provisioning (One-Time / Idempotent)
Provisions non-superuser roles (`atlas_migrator`, `atlas_app`, `atlas_ops`, `atlas_function_owner`):
```bash
# Via Node.js runner:
DATABASE_URL_MIGRATION="postgresql://postgres:<dba-pw>@<host>:5432/atlas_analytics" \
npm run db:tier1

# Or via psql:
psql -h <host> -U postgres -d atlas_analytics -f scripts/db-tier1-provision-roles.sql
```

### Step 3.2: Tier 2 Prisma Schema Deployment
Deploys all 26 migrations sequentially.
> [!IMPORTANT]
> **Administrative Credential Requirement**: Tier 2 **must** connect using an administrative connection (`DATABASE_URL_MIGRATION` connecting as Cloud Admin / DBA, e.g. `postgres`, `rds_superuser`, `cloudsqlsuperuser`).
> Direct execution as `atlas_migrator` will fail with PostgreSQL error `42501: must be member of role "postgres"` because historical migrations contain privileged `ALTER FUNCTION ... OWNER TO postgres;` and `GRANT ... TO atlas_app;` statements.
> Because Tier 2 runs as an administrative role, tables and objects are initially owned by that admin user. Step 3.3 (Tier 3) is therefore **mandatory** to normalize ownership.

```bash
DATABASE_URL_MIGRATION="postgresql://postgres:<dba-pw>@<host>:5432/atlas_analytics" \
npm run db:deploy
```

### Step 3.3: Tier 3 Post-Migration Ownership & Privilege Normalization
Normalizes object ownership and establishes strict least privilege:
- Reassigns 100% of application tables and sequences to `atlas_migrator`.
- Reassigns all 9 `SECURITY DEFINER` routines to `atlas_function_owner` (`NOLOGIN, BYPASSRLS`).
- Assigns `consume_ingestion_tokens` (`SECURITY INVOKER`) to `atlas_migrator`.
- Enforces append-only access on `audit_logs` (`INSERT` only for `atlas_app`).
- Restricts `atlas_ops` to read-only `SELECT` and bounded organization status mutations.
- Configures future `DEFAULT PRIVILEGES`.

```bash
# Via Node.js runner:
DATABASE_URL_MIGRATION="postgresql://postgres:<dba-pw>@<host>:5432/atlas_analytics" \
npm run db:tier3

# Or via psql:
psql -h <host> -U postgres -d atlas_analytics -f scripts/db-tier3-normalize-ownership.sql
```

---

## 4. Application Rollout & Hosting Infrastructure

### 4.1 Reverse Proxy & Ingress (Nginx / Cloudflare / ALB)
Configure SSE streaming buffering for `/api/analytics/live`:
```nginx
location /api/analytics/live {
    proxy_pass http://atlas_upstream;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;
    proxy_read_timeout 86400s;
}
```

### 4.2 Application Pod Startup
Deploy Next.js application containers:
```bash
# Blue/Green or Rolling Deployment:
npm run start
```

---

## 5. Health Checks & Verification Probes

### 5.1 Liveness Probe
```bash
curl -f -s https://analytics.yourdomain.com/api/health | jq .
```
Expected output (HTTP 200):
```json
{
  "status": "healthy",
  "database": "connected",
  "version": "0.1.0"
}
```

### 5.2 Readiness Probe
Confirm database connectivity across application connection pools:
```bash
curl -f -s -o /dev/null -w "%{http_code}\n" https://analytics.yourdomain.com/api/health
# Expected: 200
```

---

## 6. Post-Deployment Smoke Test Protocol

Run these smoke tests immediately following deployment:

1. **Telemetry Ingestion Health**:
   Submit an event to the public ingestion API:
   ```bash
   curl -i -X POST https://analytics.yourdomain.com/api/v1/events \
     -H "Content-Type: application/json" \
     -H "x-api-key: <valid_api_key>" \
     -d '{"events":[{"eventName":"smoke_test_event","properties":{"env":"production"}}]}'
   ```
   *Expected*: HTTP `200 OK` or `202 Accepted` with `{ "success": true, "accepted": 1 }`.
2. **Dashboard Server-Side Rendering**:
   Verify the authenticated dashboard loads:
   ```bash
   curl -s -I -H "Cookie: <session-cookie>" https://analytics.yourdomain.com/dashboard
   ```
   *Expected*: HTTP `200 OK`.
3. **Ops Console Route Protection**:
   Verify `/ops` rejects unauthenticated users:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://analytics.yourdomain.com/ops
   ```
   *Expected*: HTTP `307` or `302` redirect to `/login`.
4. **Rate Limiting Verification**:
   Verify token bucket rate limiter responds to burst traffic with appropriate `x-ratelimit-remaining` headers.

---

## 7. Rollback & Disaster Recovery Runbook

> [!CAUTION]
> **Zero Data-Loss Principle**: Never execute `pg_restore --clean --if-exists` directly against an active production database. The `--clean` flag drops tables (`DROP TABLE ... CASCADE`), permanently destroying all new production telemetry, registered organizations, and audit records created between the backup and the recovery attempt. Follow the decoupled scenarios below.

### 7.1 Scenario A: Application Image Rollback (RPO = 0, RTO < 2 minutes)
*Trigger*: Application container fails liveness/readiness probes, Next.js runtime crashes, or critical frontend regression discovered post-cutover.
*Database Impact*: **Zero database modifications required**. The database schema changes introduced in ATLAS migrations are strictly additive/backward-compatible.
1. Immediately roll back container image in your orchestrator (Kubernetes, ECS, or Docker):
   ```bash
   kubectl rollout undo deployment/atlas-analytics -n production
   ```
2. Verify traffic shifts back to the previous stable container image within 30 seconds.
3. Confirm health check recovery:
   ```bash
   curl -sSf https://analytics.yourdomain.com/api/health
   ```

### 7.2 Scenario B: Failed Migration Recovery (Pre-Traffic / Maintenance Window)
*Trigger*: Prisma migration execution (`npm run db:deploy`) fails mid-pipeline before live traffic cutover.
*Procedure*:
1. Inspect the migration status and identify the failed migration file:
   ```bash
   DATABASE_URL_MIGRATION="postgresql://postgres:<dba-pw>@<host>:5432/atlas_analytics" \
   npx prisma migrate status --config prisma7.config.ts
   ```
2. **Prisma Transaction Boundaries & Manual Cleanup Obligation**:
   - PostgreSQL executes DDL within transactions, but certain commands (e.g., `CREATE INDEX CONCURRENTLY` or multi-statement scripts that hit partial execution errors) may leave partial schema artifacts.
   - **Crucial Caution**: `npx prisma migrate resolve --rolled-back` does **NOT** roll back or drop any database objects; it **only** marks the migration record in the `_prisma_migrations` table as rolled back (`rolled_back_at = NOW()`).
   - **Mandatory Step Before Marking Rolled Back**: The DBA must inspect the failed migration's SQL file and manually execute reverse DDL via the administrative connection (e.g. `DROP TABLE IF EXISTS ...;`, `ALTER TABLE ... DROP COLUMN IF EXISTS ...;`) to ensure zero orphaned schema artifacts remain.
   - Once the database state is manually reverted to match the prior completed migration, mark the record:
     ```bash
     DATABASE_URL_MIGRATION="postgresql://postgres:<dba-pw>@<host>:5432/atlas_analytics" \
     npx prisma migrate resolve --rolled-back "<failed_migration_name>" --config prisma7.config.ts
     ```
3. Re-run `npm run db:deploy` only after resolving the underlying syntax, lock, or privilege blocker.

### 7.3 Scenario C: Database Point-In-Time Recovery (PITR) (Critical Data Corruption)
*Trigger*: Severe data corruption, catastrophic human error, or unrecoverable multi-table state divergence after cutover.

*WAL Archival, Precision & Data Loss Reality*:
- **No Inherent Zero Data Loss**: Restoring to timestamp $T_{\text{target}}$ inherently discards all transactions committed after $T_{\text{target}}$. Transactions committed between $T_{\text{target}}$ and the write freeze are permanently lost from the relational store unless buffered externally.
- **WAL Archival Frequency & Recovery Point Precision**:
  - PostgreSQL archives Write-Ahead Logs in discrete 16 MB segments or upon expiration of `archive_timeout` (default 5 minutes in standard RDS/Cloud SQL).
  - Recovery-point precision is bounded by the last completed and successfully shipped WAL segment. If an unarchived WAL buffer was lost during a cluster crash, the achievable RPO is 1–5 minutes.
  - Specifying $T_{\text{target}} = T_{\text{incident}} - 1\,\text{second}$ assumes continuous WAL streaming with sub-second replication lag (such as Aurora continuous storage replication).
- **Retention Assumptions**: Automated WAL archive retention must be configured for at least 7 to 35 days in provider storage (e.g. S3/GCS bucket retention).
- **What is Guaranteed vs. Merely Assumed**:
  - **GUARANTEED**: The restored database instance will be crash-consistent and transactionally valid up to $T_{\text{target}}$. Zero broken foreign keys or partial transaction states will exist.
  - **ASSUMED / UNRECOVERABLE WITHOUT EXTERNAL BUFFERS**: All data written between $T_{\text{target}}$ and $T_{\text{freeze}}$ cannot be recovered from the database itself. WAL archives are binary transaction logs stored in cold object storage; they are **not** queryable databases or replicas.
  - **Reconciliation Mechanism**: Delta transactions can ONLY be reconciled if:
    1. Telemetry ingestion SDKs buffered failed requests during HTTP 503 maintenance mode.
    2. An external message queue (Kafka, SQS, RabbitMQ) holds raw event payloads awaiting re-ingestion.
    3. An isolated read replica was detached/paused *before* applying the corrupting transaction, allowing delta rows to be extracted via `pg_dump`.
    If none of these external buffers exist, transactions occurring between $T_{\text{target}}$ and $T_{\text{freeze}}$ are permanently lost.

*Procedure*:
1. **Immediate Write Freeze & Maintenance Mode**:
   - Place ingress / API gateway (Cloudflare, Nginx, ALB) into maintenance mode returning HTTP `503 Service Temporarily Unavailable` with `Retry-After: 300`. This prompts telemetry SDKs to buffer events locally rather than discarding them.
   - Terminate active application connections on the database:
     ```sql
     SELECT pg_terminate_backend(pid) 
     FROM pg_stat_activity 
     WHERE datname = 'atlas_analytics' 
       AND pid <> pg_backend_pid();
     ```
2. **Recovery Point Selection**:
   - Determine the exact timestamp of the corrupting incident: $T_{\text{incident}}$.
   - Set recovery target to immediately prior to corruption: $T_{\text{target}} = T_{\text{incident}} - 1\,\text{second}$.
3. **Initiate PITR to a NEW Database Instance**:
   - In cloud console (AWS RDS / Cloud SQL): Create a point-in-time recovery restore to a **new cluster** (e.g., `atlas-analytics-recovered-20261119`) targeting timestamp $T_{\text{target}}$.
   - **Never** perform an in-place destructive restore on the active production cluster.
4. **Run Tier 3 Normalization on Recovered Cluster**:
   - Verify roles and re-apply Tier 3 normalization script on the recovered cluster:
     ```bash
     DATABASE_URL_MIGRATION="postgresql://postgres:<dba-pw>@<recovered-host>:5432/atlas_analytics" \
     npm run db:tier3
     ```
5. **Reconciliation of Buffered Writes**:
   - Replay queued telemetry events buffered at the client or edge proxies.
   - If an uncorrupted replica was preserved, extract delta audit logs and replay them.
6. **Validate Catalog and Row Counts**:
   - Run post-restore validation queries (Section 7.5).
7. **DNS / Connection String Cutover**:
   - Update `DATABASE_URL_APP` and `DATABASE_URL_OPS` in application pod secret store to point to `<recovered-host>`.
   - Restart application pods and verify `/api/health`.
   - Deactivate maintenance mode at the ingress gateway.

### 7.4 Scenario D: Logical Backup Restore (Isolated Staging Target)
*Trigger*: Total cluster destruction or offline forensic disaster recovery.
*Procedure*:
1. Provision a clean, empty target database instance (`atlas_analytics_staging` or replacement cluster).
2. Run Tier 1 DBA provisioning on target:
   ```bash
   DATABASE_URL_MIGRATION="postgresql://postgres:<dba-pw>@<target-host>:5432/atlas_analytics" \
   npm run db:tier1
   ```
3. Restore logical archive **without** `--clean` against the empty database:
   ```bash
   pg_restore -h <target-host> -U postgres -d atlas_analytics -v atlas_pre_deploy_backup_<timestamp>.dump
   ```
4. Run Tier 3 ownership and privilege normalization:
   ```bash
   DATABASE_URL_MIGRATION="postgresql://postgres:<dba-pw>@<target-host>:5432/atlas_analytics" \
   npm run db:tier3
   ```

### 7.5 Post-Restore Catalog & Integrity Validation Protocol
Before routing live production traffic to any restored database, execute these validation assertions:
1. **Verify 16 Public Tables Owned by atlas_migrator**:
   ```sql
   SELECT count(*) = 16 AS tables_ok
   FROM pg_tables 
   WHERE schemaname = 'public' AND tableowner = 'atlas_migrator';
   ```
2. **Verify 9 SECURITY DEFINER Routines Owned by atlas_function_owner**:
   ```sql
   SELECT count(*) = 9 AS secdef_ok
   FROM pg_proc p
   JOIN pg_roles r ON p.proowner = r.oid
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' 
     AND p.prosecdef = true 
     AND r.rolname = 'atlas_function_owner';
   ```
3. **Verify Zero Public Routine Grants**:
   ```sql
   SELECT count(*) = 0 AS zero_public_grants
   FROM information_schema.routine_privileges
   WHERE routine_schema = 'public' AND grantee = 'PUBLIC';
   ```
4. **Execute Application Health Check**:
   ```bash
   curl -sSf http://localhost:3000/api/health
   ```

---

## 8. Scheduled Operations

### 8.1 Daily Rollup Cron Worker
Configure a cluster CronJob (or systemd timer) to trigger UTC daily rollups at `00:15 UTC`:
```bash
curl -X POST https://analytics.yourdomain.com/api/cron/rollups \
  -H "Authorization: Bearer <CRON_SECRET>"
```
