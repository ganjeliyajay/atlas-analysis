# ATLAS — Local Development & Setup Guide

**Target Setup Time:** Under 10 minutes from clone to running dashboard.

---

## 1. Prerequisites

- **Node.js:** v20.x or v22.x LTS
- **PostgreSQL:** v17 or v18 with `psql` command-line tools
- **Package Manager:** `npm` (v10+)

---

## 2. Fast Setup (Under 10 Minutes)

### Step 1: Install Dependencies
```bash
npm ci
```

### Step 2: Configure PostgreSQL Databases & Roles
Ensure PostgreSQL is running locally on port 5432. Connect as `postgres` superuser and initialize the database and application roles:

```sql
CREATE DATABASE atlas_analytics;
CREATE DATABASE atlas_analytics_test;

CREATE ROLE atlas_app WITH LOGIN PASSWORD 'CHANGE_ME_APP_PASSWORD' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE atlas_ops WITH LOGIN PASSWORD 'CHANGE_ME_OPS_PASSWORD' NOSUPERUSER NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO atlas_app, atlas_ops;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_ops;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO atlas_app, atlas_ops;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO atlas_app, atlas_ops;
```

### Step 3: Configure Environment Variables
Create `.env` in the project root:

```env
# Non-superuser application role
DATABASE_URL_APP="postgresql://atlas_app:CHANGE_ME_APP_PASSWORD@localhost:5432/atlas_analytics"

# Background ops / rollups role (NOBYPASSRLS; explicit policies apply)
DATABASE_URL_OPS="postgresql://atlas_ops:CHANGE_ME_OPS_PASSWORD@localhost:5432/atlas_analytics"

# Schema owner / migration role (Full DDL)
DATABASE_URL_MIGRATION="postgresql://postgres:CHANGE_ME_POSTGRES_PASSWORD@localhost:5432/atlas_analytics"

# Auth.js v5 Secrets
AUTH_SECRET="CHANGE_ME_WITH_RANDOM_32_BYTE_SECRET"
NEXTAUTH_SECRET="CHANGE_ME_WITH_RANDOM_32_BYTE_SECRET"

# Rollups Secret
CRON_SECRET="CHANGE_ME_WITH_RANDOM_CRON_SECRET"

# Ingestion Benchmark Variables
ATLAS_API_KEY="atlas_live_dev_key"
ATLAS_INGEST_URL="http://localhost:3000/api/v1/events"
```

### Step 4: Run Database Migrations
```bash
npm run db:deploy
npm run db:generate
```

### Step 5: Run Automated Tests
```bash
npm test
```
*All 14 unit and integration test suites should pass green.*

### Step 6: Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 3. Seeding Realistic Benchmark Data (5,000,000 Events)

ATLAS includes a high-performance memory-efficient seed script:

1. Register an account via `http://localhost:3000/register`.
2. Run the seed script:
   ```bash
   npm run seed:phase2
   ```
   *Inserts 5,000,000 events across 3 dedicated tenants (`atlas-seed-tenant-01`, `02`, `03`) spanning 91 days.*
3. Verify seed completion:
   ```bash
   node scripts/check-seed.mjs
   ```

---

## 4. Running Rollups & Benchmarks

### Execute Scheduled Rollup Aggregation
```bash
curl -X POST http://localhost:3000/api/cron/rollups \
  -H "Authorization: Bearer atlas-development-cron-secret-32-chars" \
  -H "Content-Type: application/json" \
  -d "{}"
```

### Verify 90-Day DAU Sub-300ms Performance
```bash
node scripts/get-seed-org-ids.mjs
npm run benchmark:dau -- <ORGANIZATION_ID>
```
*Output will confirm indexed scan execution in $< 15\text{ms}$.*

### Benchmark Ingestion Throughput
```bash
npm run benchmark:ingest
```
*Measures local sustained throughput ($\ge 200$ events/sec).*

