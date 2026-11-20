# ATLAS — Streaming SSR & Suspense Boundary Architecture

**Author:** Principal Software Architect  
**Scope:** Next.js App Router 16.4.3 / React 19 Streaming SSR Hierarchy  
**Last Updated:** 2026-11-13  

---

## 1. Overview & Architectural Goals

The ATLAS analytics dashboard utilizes Next.js Server Components with Partial Prerendering (PPR) and streaming SSR. By executing data queries in the Node.js server runtime directly adjacent to the PostgreSQL database, the client downloads zero heavy data-fetching libraries and receives immediate static HTML shells with progressive widget streaming.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Root Layout (Server Shell)                      │
│                                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │   DashboardSidebar      │  │        DashboardHeader              │  │
│  │   (Static Navigation)   │  │   (Org Switcher & User Profile)     │  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Page Shell: /dashboard (Server Component)                       │  │
│  │  - Welcome Banner (Static / Fast RSC)                            │  │
│  │  - <DashboardClientFilters /> (Client Component: URL Sync)       │  │
│  │                                                                  │  │
│  │  ┌── <Suspense fallback={<DashboardSkeletons />}> ────────────┐  │  │
│  │  │                                                            │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  <KpiWidget /> (Server Component)                    │  │  │  │
│  │  │  │  - Total Events, Active Users, DAU, WAU, MAU         │  │  │  │
│  │  │  └──────────────────────────────────────────────────────┘  │  │  │
│  │  │                                                            │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  <InteractiveChart /> (Client Interactive AreaChart) │  │  │  │
│  │  │  │  - Daily Event Volume & Active Users Over Time       │  │  │  │
│  │  │  └──────────────────────────────────────────────────────┘  │  │  │
│  │  │                                                            │  │  │
│  │  │  ┌──────────────────────────┐ ┌─────────────────────────┐  │  │  │
│  │  │  │ <TopEventsWidget />      │ │ <RecentEventsWidget />  │  │  │  │
│  │  │  │ (Top Actions Breakdown)  │ │ (Live Recent Activity)  │  │  │  │
│  │  │  └──────────────────────────┘ └─────────────────────────┘  │  │  │
│  │  │                                                            │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Suspense Boundaries Breakdown

| Boundary Name | Location | Fallback Component | Stream Priority | Reason |
|:---|:---|:---|:---|:---|
| **Root Dashboard Boundary** | `app/dashboard/page.tsx:162` | `<KpiGridSkeleton />`, `<ChartSkeleton />`, `<TopEventsSkeleton />`, `<RecentEventsSkeleton />` | **High** | Allows instant paint of the sidebar, breadcrumbs, welcome banner, and date filter controls while database queries resolve. |
| **KPI Metric Grid** | `components/dashboard/KpiWidget.tsx` | `<KpiGridSkeleton />` (5 animated pulse cards) | **High** | Reads single-pass active user and event aggregations; renders critical executive numbers. |
| **Telemetry Chart** | `components/dashboard/InteractiveChart.tsx` | `<ChartSkeleton />` (260px height skeleton) | **Medium** | Renders daily time-series from `event_daily_rollups` with client metric toggles (`eventVolume` vs `activeUsers`). |
| **Top Events Card** | `components/dashboard/TopEventsWidget.tsx` | `<TopEventsSkeleton />` (5 progress bar rows) | **Low** | Renders group-by event frequency ranking. |
| **Recent Activity Feed** | `components/dashboard/RecentEventsWidget.tsx` | `<RecentEventsSkeleton />` (5 list item rows) | **Low** | Queries latest 10 events with project and user identification. |

---

## 3. URL Synchronization & State Model

- **Source of Truth:** Browser URL search parameters (`?range=30d&startDate=...&endDate=...&projectId=...&eventName=...&userId=...`).
- **Client Synchronization:** Handled via `DashboardClientFilters.tsx` using `useTransition` and `router.push('/dashboard?...')`.
- **SSR Re-evaluation:** `searchParamsPromise` triggers server-side stream resolution without unmounting the layout or triggering full client hydration resets.
- **Back/Forward Navigation:** Native browser history works out of the box because parameters reside directly in the query string.
