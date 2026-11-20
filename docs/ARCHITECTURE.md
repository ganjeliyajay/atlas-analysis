# ATLAS — System Architecture & Component Design

## 1. System Overview

ATLAS is a multi-tenant product analytics platform inspired by Mixpanel. It provides high-throughput event ingestion, real-time analytics dashboards, conversion funnels, retention cohort matrices, and internal platform operations telemetry without unnecessary marketing fluff.

---

## 2. High-Level Architecture Diagram

```
[ Mobile / Web Applications / Backend Servers ]
                      │
                      │ HTTPS POST /api/v1/events
                      ▼
┌─────────────────────────────────────────────────────────┐
│              ATLAS Ingestion Gateway                    │
│  - API Key Prefix Match & Scrypt Verification           │
│  - Tenant Suspension Status Check                       │
│  - Zod Batch Validation (Up to 500 events)              │
│  - PostgreSQL Token Bucket Rate Limiter                 │
│  - 24-Hour Idempotency Key Validation                   │
│  - Atomic Monthly Quota Check & Increment               │
└─────────────────────────────┬───────────────────────────┘
                              │
               Prisma interactive transaction
           SET LOCAL app.tenant_id = :tenantId
                              ▼
┌─────────────────────────────────────────────────────────┐
│           PostgreSQL 18 Multi-Tenant Engine             │
│  - Row-Level Security (RLS) on all tenant tables         │
│  - Raw Partition: "AnalyticsEvent" (Source of Truth)    │
│  - Rollup Partition: "event_hourly_rollups" (72h window)│
│  - Rollup Partition: "event_daily_rollups" (90d window) │
│  - Metadata: Users, Organizations, Members, ApiKeys     │
└─────────────────────────────┬───────────────────────────┘
                              │
               Query read path via RLS context
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│   Customer Analytics Dashboard│   │   Platform Operations Console │
│  - DAU / WAU / MAU Widgets    │   │  - Superadmin RBAC Auth       │
│  - 30d Timeseries Area Charts │   │  - Cluster & Partition Telemetry│
│  - Sequential Funnel Builder  │   │  - Tenant Quota Governance    │
│  - Retention Cohort Heatmap   │   │  - Tenant Suspension Control  │
│  - SSE Real-Time Event Stream │   │  - Audit Trail Logging        │
│  - Streaming Chunked CSV Export│  └───────────────────────────────┘
└───────────────────────────────┘
```

---

## 3. Core Domain Entities

1. **User:** Global authenticated identity with credentials, email verification, and system role (`owner`, `admin`, `viewer`, `superadmin`).
2. **Organization (Tenant):** Primary boundary for tenancy. Owns projects, API keys, invitations, quotas, and rollups.
3. **OrganizationMember:** Links a User to an Organization with a localized role.
4. **Project:** Ingestion environment (e.g. Production, Staging) belonging to an Organization.
5. **ApiKey:** Scrypt-hashed, prefix-indexed revocable credentials for authenticating event ingestion.
6. **AnalyticsEvent:** Immutable product event record containing `eventName`, optional `userId`, `sessionId`, device metadata, and flexible `properties` (JSONB).
7. **OrganizationUsage:** Tracks monthly consumed events per organization with atomic upsert guards against `Organization.eventQuota`.
8. **IngestionTokenBucket:** Manages fair-share rate limits (10,000 capacity, 200/s refill) per API key.
9. **EventHourlyRollup / EventDailyRollup:** Precomputed aggregate metrics with an explicit `__all__` bucket for distinct user counts.
10. **AuditLog:** Records staff operations actions (suspensions, reactivations, quota modifications).

---

## 4. Query Routing Architecture

```
Incoming Dashboard Query (?range=30d&projectId=All)
                      │
                      ▼
       Whole UTC calendar day boundary?
        AND No ad-hoc property filter?
                     / \
             YES    /   \   NO
                   /     \
                  ▼       ▼
┌───────────────────────┐   ┌───────────────────────────────┐
│ Fast Rollup Read Path │   │ Raw Event Scan Path           │
│ event_daily_rollups   │   │ "AnalyticsEvent"              │
│ Execution: ~11ms      │   │ Execution: 100 - 250ms        │
└───────────────────────┘   └───────────────────────────────┘
```

