# Phase 1 build and migration repair

This patch addresses the errors reported after extracting `ATLAS_Phase_1_Completed.zip`.

## 1. Recover the failed migration

The previous deployment recorded `20261106100000_phase1_rls_hardening` as failed because the migration referenced `public.is_canonical_org_owner_membership(TEXT, TEXT)` before defining it.

The corrected migration now creates the helper function before creating the policies. Because Prisma records the previous failure, mark that migration as rolled back and then deploy it again:

```bash
npx prisma migrate resolve --rolled-back 20261106100000_phase1_rls_hardening
npx prisma migrate deploy
```

Do not run `prisma migrate reset` against a database containing data you need to keep.

## 2. TypeScript ingestion fixes

`app/api/events/route.ts` now imports `hashLegacyApiKey` and `verifyApiKey`, only performs the legacy unique lookup when the hash is non-null, and explicitly constructs the project/quota object instead of assigning a differently inferred Prisma selection type.

## 3. Membership role update

Normal role updates now call the database function `public.update_organization_member_role`. The function checks the active user, tenant, actor role, canonical owner, target membership, and permitted role transition in PostgreSQL. Ownership transfer remains handled by the existing atomic ownership-transfer function.

## 4. Re-run verification

```bash
npx prisma generate
npx prisma migrate deploy
npm run lint
npx tsc --noEmit
npm test
npm run build
```

The two lint warnings previously reported are non-blocking. They are unrelated to the TypeScript build errors.

## 5. Expected Phase 1 checks

- `tests/integration/rls-write-isolation.test.ts`
- `tests/integration/organization-role-api.test.ts`
- `tests/integration/rls-tenant-isolation.test.ts`
- `tests/integration/rls-context-leakage.test.ts`
- `tests/integration/ownership-transfer.test.ts`

Run the tests with the documented `DATABASE_URL_APP` and `DATABASE_URL_MIGRATION` roles configured. The application-role RLS tests must connect as `atlas_app`, not as a superuser or migration role.
