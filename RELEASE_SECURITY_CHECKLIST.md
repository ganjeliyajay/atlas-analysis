# ATLAS Release Security Checklist

## Archive integrity
- [x] `.env.example` retained as a placeholder-only template.
- [x] `.env`, `.env.test`, `.env.local`, `.env.production`, and other `.env.*` files excluded.
- [x] Private keys/certificates (`.pem`, `.key`, `.p12`, `.pfx`) excluded.
- [x] `.github/workflows/ci.yml` included at the exact required path.
- [x] `node_modules`, `.next`, `coverage`, `playwright-report`, `test-results`, and `*.tsbuildinfo` excluded.
- [x] Both release ZIPs independently inspected; ZIP CRC/integrity test passed.
- [x] Primary and legacy release archives are byte-identical.

## Application and database security
- [x] Benchmark scripts use environment-provided connection strings; no embedded local DB passwords.
- [x] 5M ingestion harness rejects remote database/ingestion hosts, production-like database names, superusers, and missing safety confirmation.
- [x] Ingestion benchmark validates API response counts and database row counts.
- [x] Interrupt handling drains active requests before fixture cleanup and baseline verification.
- [x] Legacy broad-grant helper is disabled; reviewed migrations are the source of database grants and RLS policies.
- [x] Lighthouse audit credentials are environment-provided; dashboard audits require verified authentication.

## CI and release checks
- [x] CI YAML parses successfully.
- [x] All `scripts/*.mjs` files pass Node syntax checks.
- [x] Release archive verifier passes on the generated archives.
- [ ] `npm ci` and full test suite completed in a fully provisioned local environment.
- [ ] GitHub-hosted Actions run passes after push.
- [ ] Full 5M ingestion test passes in isolated staging load-test infrastructure.
- [ ] Production deployment and post-deployment smoke tests pass.

## Required environment policy
Never commit or share `.env` files. Copy `.env.example` to `.env` locally and generate unique secrets. Rotate any credentials previously exposed in uploaded archives or shared logs. Do not reuse CI placeholder credentials in any real environment.
