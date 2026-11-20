#!/usr/bin/env bash
# ==============================================================================
# ATLAS ANALYTICS: STAGING TARGET PRE-FLIGHT IDENTITY & SAFETY GUARD (POSIX BASH)
# Strict read-only verification of database identity, major version (16 or 17 only),
# host allowlist, production pattern rejection, and native superuser privilege.
#
# Safety Guarantee: ZERO database mutations. Fail-closed on any ambiguity.
#
# Exit Codes:
#   0: Pre-flight identity verification PASSED (certified PostgreSQL 16/17 staging target).
#   1: Configuration error (missing required arguments or environment parameters).
#   2: FORBIDDEN production pattern detected in host, database, or connection settings.
#   3: Host NOT allowlisted.
#   4: Database identity mismatch (database name does not match expected staging identity).
#   5: Connected role lacks native superuser privileges.
#   6: Incompatible PostgreSQL major version (strictly rejects PG < 16 or PG >= 18).
#   7: Connection failure or network error.
# ==============================================================================
set -euo pipefail

DEFAULT_ALLOWED_HOSTS=(
  "staging-pg16.internal"
  "staging-pg17.internal"
  "10.0.10.45"
  "staging-db.atlas.local"
)

FORBIDDEN_PROD_PATTERNS=(
  "prod"
  "production"
  "rds.amazonaws.com"
  "cloudsql"
  "neon.tech"
  "supabase.co"
  "cockroachlabs.cloud"
)

FORBIDDEN_PROD_DB_NAMES=(
  "atlas_analytics_prod"
  "atlas_analytics_production"
  "production"
  "prod"
)

TARGET_HOST="${PGHOST:-${1:-}}"
TARGET_PORT="${PGPORT:-${2:-5432}}"
TARGET_DB="${PGDATABASE:-atlas_analytics_staging}"
TARGET_USER="${PGUSER:-postgres}"

EXPECTED_STAGING_ENV="${EXPECTED_STAGING_ENV:-}"
EXPECTED_STAGING_DB="${EXPECTED_STAGING_DB:-${TARGET_DB}}"
ALLOW_LOCALHOST_STAGING="${ALLOW_LOCALHOST_STAGING:-false}"

echo "================================================================="
echo "ATLAS STAGING IDENTITY & SAFETY GUARD (POSIX BASH)"
echo "================================================================="
echo "Target Host:       ${TARGET_HOST}:${TARGET_PORT}"
echo "Target Database:   ${TARGET_DB}"
echo "Target User:       ${TARGET_USER}"
echo "Expected Staging:  ${EXPECTED_STAGING_DB} (env: ${EXPECTED_STAGING_ENV:-unspecified})"
echo "================================================================="

# 1. Parameter Validation
if [[ -z "${TARGET_HOST}" ]]; then
  echo "FATAL [Exit 1]: Target host not specified. Provide via PGHOST or argument." >&2
  echo "Usage: $0 <target-host> [target-port]" >&2
  exit 1
fi

if [[ -z "${EXPECTED_STAGING_ENV}" || "${EXPECTED_STAGING_ENV,,}" != "staging" ]]; then
  echo "FATAL [Exit 1]: Missing or invalid EXPECTED_STAGING_ENV environment variable." >&2
  echo "EXPECTED_STAGING_ENV must be explicitly set to 'staging' to confirm target intent." >&2
  exit 1
fi

LOWER_HOST="${TARGET_HOST,,}"
LOWER_DB="${TARGET_DB,,}"

# 2. Production Pattern Rejection
for pattern in "${FORBIDDEN_PROD_PATTERNS[@]}"; do
  if [[ "${LOWER_HOST}" == *"${pattern}"* ]]; then
    echo "CRITICAL REJECTION [Exit 2]: Target host '${TARGET_HOST}' matches forbidden production pattern '${pattern}'!" >&2
    exit 2
  fi
done

for prod_db in "${FORBIDDEN_PROD_DB_NAMES[@]}"; do
  if [[ "${LOWER_DB}" == "${prod_db}" ]]; then
    echo "CRITICAL REJECTION [Exit 2]: Target database name matches protected production database name '${prod_db}'!" >&2
    exit 2
  fi
done

# 3. Host Allowlist Verification
ALLOWED_HOSTS=("${DEFAULT_ALLOWED_HOSTS[@]}")
if [[ "${ALLOW_LOCALHOST_STAGING}" == "true" ]]; then
  ALLOWED_HOSTS+=("localhost" "127.0.0.1" "::1")
fi

HOST_ALLOWED=false
for allowed in "${ALLOWED_HOSTS[@]}"; do
  if [[ "${LOWER_HOST}" == "${allowed,,}" ]]; then
    HOST_ALLOWED=true
    break
  fi
done

if [[ "${HOST_ALLOWED}" != "true" ]]; then
  echo "CRITICAL REJECTION [Exit 3]: Target host '${TARGET_HOST}' is NOT in the certified staging allowlist!" >&2
  exit 3
fi

# 4. Expected Database Identity Check
if [[ "${LOWER_DB}" != "${EXPECTED_STAGING_DB,,}" ]]; then
  echo "CRITICAL REJECTION [Exit 4]: Database name '${TARGET_DB}' does not match expected staging identity '${EXPECTED_STAGING_DB}'!" >&2
  exit 4
fi

if [[ "${LOWER_DB}" == "atlas_analytics" && "${CONFIRM_ISOLATED_STAGING_DB:-false}" != "true" ]]; then
  echo "CRITICAL REJECTION [Exit 4]: Target database is named 'atlas_analytics', matching production naming convention!" >&2
  exit 4
fi

# 5. Connect and Inspect Engine Identity (Read-Only)
echo "[Pre-Flight] Connecting to target database for read-only identity inspection..."

if ! command -v psql &> /dev/null; then
  echo "FATAL [Exit 7]: 'psql' binary is required for POSIX bash pre-flight guard." >&2
  exit 7
fi

CHECK_OUTPUT=$(psql -h "${TARGET_HOST}" -p "${TARGET_PORT}" -U "${TARGET_USER}" -d "${TARGET_DB}" \
  -v ON_ERROR_STOP=1 --no-password -t -A -F "|" -c "
  SELECT 
    current_database(),
    current_user,
    coalesce(inet_server_addr()::text, 'local'),
    coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false),
    current_setting('server_version'),
    (current_setting('server_version_num')::integer / 10000)::text
" 2>&1) || {
  echo "FATAL [Exit 7]: Failed to connect to database: ${CHECK_OUTPUT}" >&2
  exit 7
}

IFS='|' read -r VERIFIED_DB VERIFIED_USER SERVER_IP IS_SUPERUSER PG_VER_STR PG_MAJOR_VER <<< "${CHECK_OUTPUT}"

echo "✓ Verified Database:     ${VERIFIED_DB}"
echo "✓ Verified User:         ${VERIFIED_USER}"
echo "✓ Connected Server IP:   ${SERVER_IP}"
echo "✓ Native Superuser:      ${IS_SUPERUSER}"
echo "✓ Engine Version String: ${PG_VER_STR}"
echo "✓ Major Version:         ${PG_MAJOR_VER}"

# 6. Verify Superuser
if [[ "${IS_SUPERUSER}" != "t" && "${IS_SUPERUSER}" != "true" ]]; then
  echo "CRITICAL REJECTION [Exit 5]: User '${VERIFIED_USER}' does NOT have native superuser privileges!" >&2
  exit 5
fi

# 7. Verify Supported Major Version (16 or 17 only)
if [[ "${PG_MAJOR_VER}" != "16" && "${PG_MAJOR_VER}" != "17" ]]; then
  echo "CRITICAL REJECTION [Exit 6]: Incompatible PostgreSQL major version: ${PG_MAJOR_VER}!" >&2
  echo "The ATLAS self-hosted architecture is certified strictly for PostgreSQL 16 or 17. Detected: ${PG_VER_STR}." >&2
  exit 6
fi

echo "================================================================="
echo "✓ PRE-FLIGHT VERIFICATION PASSED: Database identity and PostgreSQL 16/17 certified."
echo "================================================================="
exit 0
