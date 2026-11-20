# ATLAS Analytics — Self-Hosted PostgreSQL Staging Runbook

**Environment Target:** Self-Managed PostgreSQL 16/17 (AWS EC2 / Linux Host / Docker)  
**Security Model:** Native `postgres` Superuser Access (Bypasses AWS RDS / GCP Cloud SQL Limitations)  
**Document Version:** 2.0.0 (Hardened Archival, Measured RPO & Credential Safety)  
**Date:** November 19, 2026  

---

## 1. Architectural Scope & Infrastructure Distinction

### 1.1 Self-Managed EC2 / Linux Host vs. Managed AWS RDS / Aurora
This staging runbook is strictly designed for **self-hosted / self-managed PostgreSQL** instances where operators maintain true root superuser access (`postgres` role with `rolsuper = true`).

```
+---------------------------------------------------------------------------------------+
| ARCHITECTURAL COMPARISON: SELF-MANAGED EC2 VS. MANAGED RDS / AURORA                   |
+---------------------------------------------------------------------------------------+
| Feature / Privilege                | Self-Hosted (EC2/Linux/Docker) | AWS RDS / Aurora|
+------------------------------------+--------------------------------+-----------------+
| Native Superuser Access (`postgres`)| YES (`rolsuper = true`)        | NO (`rdsadmin`) |
| Customer Admin Role                | `postgres`                     | `rds_superuser` |
| `BYPASSRLS` Delegation Capability  | YES (Permitted for superuser)  | NO (Blocked)    |
| Custom Role Provisioning           | 100% Compatible with Tier 1-3  | INCOMPATIBLE    |
| OS-Level Access / Patroni / WAL    | Full Customer Control          | AWS Blackbox    |
+------------------------------------+--------------------------------+-----------------+
```

---

## 2. Infrastructure Setup & PostgreSQL 16/17 Configuration

### 2.1 Host Specifications (Staging Environment)
- **Instance Type:** AWS EC2 `c6i.xlarge` or `t4g.xlarge` (4 vCPU, 8–16 GB RAM, 100 GB gp3 EBS).
- **Operating System:** Ubuntu 24.04 LTS / Debian 12 / AlmaLinux 9.
- **PostgreSQL Version:** 16.4+ or 17.0+ official PGDG packages (`postgresql-16`, `postgresql-contrib`).

### 2.2 Robust WAL Archiving Architecture

> [!CAUTION]
> **Disaster Recovery Rule**: A local directory on the same host or EBS volume is **not** disaster-recovery storage. If the host suffers hardware termination or volume corruption, local archives are lost. WAL segments must be continuously shipped to remote, durable, versioned object storage (AWS S3, Cloudflare R2, or GCS).

#### Primary Recommended Strategy: `pgBackRest` with S3 Storage
Configure `archive_command` to invoke `pgbackrest` with asynchronous multi-threaded pushing, SHA-256 integrity verification, and compression:

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest --stanza=atlas_analytics archive-push %p'
archive_timeout = 300       # Forces a segment switch every 5 minutes if activity occurred
```

**Required `pgbackrest.conf` stanza:**
```ini
[atlas_analytics]
pg1-path=/var/lib/postgresql/16/main
pg1-user=postgres

[global]
repo1-type=s3
repo1-s3-bucket=atlas-analytics-staging-wal-archive
repo1-s3-endpoint=s3.us-east-1.amazonaws.com
repo1-s3-region=us-east-1
repo1-s3-uri-style=path
repo1-path=/backup
repo1-s3-kms-key-id=arn:aws:kms:us-east-1:123456789012:key/atlas-staging-key
repo1-cipher-type=aes-256-cbc
repo1-retention-full=4
repo1-retention-diff=14
process-max=4
log-level-console=info
log-level-file=detail
```

**IAM Policy for S3 Archival (Least Privilege):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowWALArchivePushAndPull",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::atlas-analytics-staging-wal-archive",
        "arn:aws:s3:::atlas-analytics-staging-wal-archive/*"
      ]
    }
  ]
}
```

#### Secondary Local Testing Script `[LOCAL TEST FIXTURE ONLY - NEVER FOR PRODUCTION/DR]`
If testing in a strictly isolated local environment without S3 access, use an **idempotent** shell script that verifies byte identity and refuses silent overwrites:

```bash
#!/bin/sh
# /usr/local/bin/atlas-local-archive-wal.sh
# Usage: atlas-local-archive-wal.sh %p %f
set -eu

SOURCE="$1"
FILENAME="$2"
DESTDIR="/var/lib/postgresql/wal_archive"
DESTFILE="${DESTDIR}/${FILENAME}"
TMPFILE="${DESTDIR}/${FILENAME}.tmp.$$"

mkdir -p "${DESTDIR}"

if [ -f "${DESTFILE}" ]; then
  # If file exists with identical content, exit 0 (idempotent success)
  if cmp -s "${SOURCE}" "${DESTFILE}"; then
    exit 0
  else
    echo "FATAL: Destination file ${DESTFILE} exists with different contents!" >&2
    exit 1
  fi
fi

# Atomic write via temporary file
cp "${SOURCE}" "${TMPFILE}"
mv "${TMPFILE}" "${DESTFILE}"
exit 0
```

---

## 3. Operational RPO Measurement & Monitoring

### 3.1 RPO as an Operationally Measured Metric (Not an Assumed Guarantee)
RPO cannot be assumed from configuration flags. Stating that `archive_timeout = 300` guarantees a 5-minute RPO is mathematically false: if `archive_command` fails, RPO degrades linearly with the duration of the failure.

$$\text{Measured RPO} = T_{\text{current}} - T_{\text{last\_verified\_archived\_transaction}}$$

### 3.2 Real-Time Archival Health Metrics (`pg_stat_archiver`)
PostgreSQL exposes the archiver's internal state via `pg_stat_archiver`:

```sql
SELECT 
    archived_count,
    last_archived_wal,
    last_archived_time,
    failed_count,
    last_failed_wal,
    last_failed_time,
    stats_reset,
    NOW() - last_archived_time AS archive_lag
FROM pg_stat_archiver;
```

**Critical Metrics to Understand:**
1. `last_archived_wal`: The file name of the most recently archived WAL segment.
2. `last_archived_time`: The timestamp when the archiver process completed writing/shipping the segment. **Caution**: This is NOT the commit timestamp of transactions inside that segment.
3. `failed_count`: Number of consecutive or cumulative failed archiving attempts. Any non-zero failure count indicates that the archiver is stuck retrying the same segment.
4. `last_failed_time`: Timestamp of the most recent archival error.
5. **Physical LSN Lag**:
   ```sql
   SELECT 
     pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0'::pg_lsn)) AS current_wal_position,
     pg_walfile_name(pg_current_wal_lsn()) AS current_active_wal_file;
   ```

### 3.3 Active Prometheus / Alertmanager Rules
```yaml
- alert: PostgresWalArchivalLag
  expr: (time() - pg_stat_archiver_last_archived_time) > 600
  for: 3m
  labels:
    severity: critical
  annotations:
    summary: "PostgreSQL WAL archival lag exceeds 10 minutes on staging DB"
    description: "Archiver process has not successfully uploaded a WAL segment in > 10m on {{ $labels.instance }}."

- alert: PostgresWalArchivalFailed
  expr: increase(pg_stat_archiver_failed_count[5m]) > 0
  for: 1m
  labels:
    severity: page
  annotations:
    summary: "PostgreSQL WAL archiver is failing to ship segments to S3"
    description: "pg_stat_archiver reports consecutive upload failures on {{ $labels.instance }}."
```

---

## 4. End-to-End Disaster Recovery & PITR Rehearsal

### 4.1 Step 1: Canary Transaction Insertion
Create a verifiable transaction with microsecond timestamp tracking:
```sql
INSERT INTO "audit_logs" (
    id, "organizationId", action, entity, "entityId", metadata, "createdAt"
) VALUES (
    'canary-staging-pitr-test-1',
    'org-staging-canary',
    'STAGING_PITR_REHEARSAL',
    'system_test',
    'target-1',
    jsonb_build_object('test', 'canary_pitr', 'stage', 'pre_failure'),
    clock_timestamp()
) RETURNING id, "createdAt" AS t_canary;
```
*Record the exact returned `t_canary` timestamp.*

### 4.2 Step 2: Force Segment Switch & Confirm Remote Storage
1. Force segment rotation:
   ```sql
   SELECT pg_switch_wal();
   ```
2. Verify in `pg_stat_archiver` that `archived_count` incremented.
3. Verify remote S3 object existence via AWS CLI:
   ```bash
   aws s3 ls s3://atlas-analytics-staging-wal-archive/backup/
   ```

### 4.3 Step 3: Simulate Archival Outage & Verify Alerts
1. Temporarily revoke write permissions or point S3 endpoint to an unreachable IP.
2. Generate synthetic transactions:
   ```sql
   INSERT INTO "AnalyticsEvent" ("id", "projectId", "eventName", "timestamp", "payload", "createdAt")
   VALUES ('test-event-lag-1', 'proj-staging-1', 'canary.lag', NOW(), '{}', NOW());
   SELECT pg_switch_wal();
   ```
3. Confirm `pg_stat_archiver.failed_count` increments.
4. Verify Prometheus alert `PostgresWalArchivalFailed` fires.
5. Restore S3 network connectivity and confirm the backlog clears automatically without operator intervention.

### 4.4 Step 4: Replay to Isolated Target Database
1. Provision isolated target instance: `atlas_analytics_pitr_target`.
2. Configure `recovery.signal` and `postgresql.conf`:
   ```ini
   restore_command = 'pgbackrest --stanza=atlas_analytics archive-get %f %p'
   recovery_target_time = '2026-11-19 16:30:00.000000+00' # Target prior to canary
   recovery_target_action = 'promote'
   ```
3. Start target PostgreSQL instance and observe recovery logs:
   ```
   LOG: starting point-in-time recovery to 2026-11-19 16:30:00+00
   LOG: restored log file "000000010000000100000045" from archive
   LOG: recovery stopping before commit of transaction ...
   LOG: archive recovery complete
   ```
4. **Validation Assertions**:
   - Case A ($T_{\text{target}} < T_{\text{canary}}$):
     ```sql
     SELECT count(*) = 0 AS canary_properly_reverted
     FROM "audit_logs" WHERE id = 'canary-staging-pitr-test-1';
     ```
   - Case B ($T_{\text{target}} \ge T_{\text{canary}}$):
     ```sql
     SELECT count(*) = 1 AS canary_properly_recovered
     FROM "audit_logs" WHERE id = 'canary-staging-pitr-test-1';
     ```

---

## 5. Secure Credential Handling & Execution Safety Controls

### 5.1 Prohibition of Command-Line Secrets
> [!CAUTION]
> **Credential Safety Rule**: Never pass plain passwords in shell arguments, command-line strings (`psql "postgresql://user:password@..."`), or committed scripts. Command arguments appear in process listings (`ps aux`), shell history (`~/.bash_history`), and system audit logs.

### 5.2 Secret Injection via Secret Manager or POSIX `.pgpass`
Use POSIX `.pgpass` with strict `0600` permissions or temporary environment injection via HashiCorp Vault / AWS Secrets Manager:

```bash
# Secure .pgpass format: hostname:port:database:username:password
cat << 'EOF' > ~/.pgpass
staging-pg16.internal:5432:atlas_analytics:postgres:SECURE_STAGING_PASSWORD_HERE
staging-pg16.internal:5432:atlas_analytics:atlas_migrator:SECURE_MIGRATOR_PW_HERE
staging-pg16.internal:5432:atlas_analytics:atlas_app:SECURE_APP_PW_HERE
staging-pg16.internal:5432:atlas_analytics:atlas_ops:SECURE_OPS_PW_HERE
EOF
chmod 0600 ~/.pgpass
```

### 5.3 Host Allowlist & Production Rejection Pre-Flight Guard
Before executing Tier 1, Tier 2, or Tier 3 scripts, the deployment tool must execute this pre-flight verification:

```bash
#!/usr/bin/env bash
# scripts/deploy/verify-staging-target.sh
set -euo pipefail

TARGET_HOST="${PGHOST:-staging-pg16.internal}"
ALLOWED_STAGING_HOSTS=("staging-pg16.internal" "10.0.10.45" "staging-db.atlas.local")

# 1. Reject production domains explicitly
if [[ "${TARGET_HOST}" =~ (prod|production|rds\.amazonaws\.com|cloudsql) ]]; then
  echo "FATAL ERROR: Target host ${TARGET_HOST} matches production or restricted managed provider pattern! ABORTING." >&2
  exit 1
fi

# 2. Verify target host is in staging allowlist
HOST_PERMITTED=false
for allowed in "${ALLOWED_STAGING_HOSTS[@]}"; do
  if [[ "${TARGET_HOST}" == "${allowed}" ]]; then
    HOST_PERMITTED=true
    break
  fi
done

if [[ "${HOST_PERMITTED}" != "true" ]]; then
  echo "FATAL ERROR: Host ${TARGET_HOST} is not in the certified staging allowlist!" >&2
  exit 1
fi

# 3. Verify database engine identity and superuser access
psql -h "${TARGET_HOST}" -d atlas_analytics -U postgres -v ON_ERROR_STOP=1 << 'EOF'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper = true) THEN
    RAISE EXCEPTION 'Current user % is not a native superuser! Staging runbook requires superuser access.', current_user;
  END IF;
  IF current_database() NOT LIKE '%staging%' AND current_database() <> 'atlas_analytics' THEN
    RAISE EXCEPTION 'Unexpected database name %!', current_database();
  END IF;
END $$;
EOF

echo "✓ Target database verified: Staging host allowlisted and native superuser access confirmed."
```

---

## 6. Three-Tier Deployment Protocol Execution

### 6.1 Step 1: Tier 1 DBA Role Provisioning
```bash
PGHOST="staging-pg16.internal" PGUSER="postgres" PGDATABASE="atlas_analytics" \
node scripts/db-tier1-provision-roles.mjs
```

### 6.2 Step 2: Tier 2 Schema Migrations
```bash
PGHOST="staging-pg16.internal" PGUSER="postgres" PGDATABASE="atlas_analytics" \
npx prisma migrate deploy --config prisma7.config.ts
```

### 6.3 Step 3: Tier 3 Ownership & Privilege Normalization
```bash
PGHOST="staging-pg16.internal" PGUSER="postgres" PGDATABASE="atlas_analytics" \
node scripts/db-tier3-normalize-ownership.mjs
```

---

## 7. Staging Verification Assertions Checklist

Run these SQL assertions directly against the staging database:

```sql
-- 1. Verify all 16 tables owned by atlas_migrator
SELECT count(*) = 16 AS tables_owned_by_migrator
FROM pg_tables 
WHERE schemaname = 'public' AND tableowner = 'atlas_migrator';

-- 2. Verify all 9 SECURITY DEFINER functions owned by atlas_function_owner
SELECT count(*) = 9 AS secdef_owned_by_function_owner
FROM pg_proc p
JOIN pg_roles r ON p.proowner = r.oid
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.prosecdef = true 
  AND r.rolname = 'atlas_function_owner';

-- 3. Verify zero public execution grants on routines
SELECT count(*) = 0 AS zero_public_routine_grants
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND grantee = 'PUBLIC';
```

---

## 8. Self-Hosted Operational Responsibilities Summary

1. **Continuous Backup & WAL Monitoring:** Deploy `pgBackRest` with automated daily full and differential backups shipped to S3. Monitor `pg_stat_archiver` lag continuously.
2. **High Availability & Failover:** Implement **Patroni** with multi-AZ replication.
3. **OS & PostgreSQL Patching:** Scheduled monthly updates (`postgresql-16` / `postgresql-17` minor releases).
4. **Credential Rotation:** Quarterly automated rotation of SCRAM-SHA-256 secrets via HashiCorp Vault.
