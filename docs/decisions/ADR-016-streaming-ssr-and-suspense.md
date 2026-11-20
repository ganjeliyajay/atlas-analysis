# ADR-016: Streaming Server-Side Rendering (SSR) and Suspense Boundary Architecture

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** Lead Architect, Frontend Team

## Context
A rich product analytics dashboard contains disparate components with varying data fetching latencies:
1. Static shell: navigation, top bar, organization selector ($< 1\text{ms}$).
2. Cheap summary metrics: DAU, WAU, total events from rollups ($< 15\text{ms}$).
3. Medium charts: 30-day timeseries area charts ($< 50\text{ms}$).
4. Expensive computations: multi-step funnels and weekly cohort retention heatmaps ($100 - 300\text{ms}$).

## Problem
In a monolithic SSR model with a single `await` at the top of the page, the entire HTML response is blocked until the slowest database query completes. The user stares at a blank screen or spinner, resulting in poor Time to First Byte (TTFB), poor Largest Contentful Paint (LCP), and low Lighthouse performance scores.

## Options Considered
1. **Monolithic Server-Side Await:** Single top-level server component awaiting all queries.
   - *Pros:* Single data bundle.
   - *Cons:* Extremely high TTFB; slowest query blocks entire dashboard.
2. **Client-Side SPA Architecture:** Empty HTML shell that fires 10 simultaneous REST requests from React `useEffect`.
   - *Pros:* Shell renders immediately.
   - *Cons:* Request waterfall, client CPU spikes, poor SEO, cascading layout shifts.
3. **Stratified Streaming SSR with Progressive Suspense Boundaries (Selected):** Render static shell instantly with Partial Prerendering (PPR), wrap widgets in granular `<Suspense>` boundaries with geometry-matched skeletons, and stream HTML chunks via HTTP chunked transfer.

## Decision
Adopt Option 3.
- Partial Prerendering (PPR): The root layout and dashboard shell are prerendered as static HTML.
- Skeletons: Skeletons match the exact pixel height, padding, and layout of resolved components to prevent Cumulative Layout Shift (CLS = 0).
- Independent Streams:
  - KPI Summary widgets stream first.
  - Timeseries charts stream second.
  - Granular table lists and feeds stream third.
- Documented in `docs/architecture/SUSPENSE_BOUNDARY_MAP.md`.

## Consequences
- Immediate visual feedback ($< 50\text{ms}$ TTFB).
- Mobile Lighthouse performance target $\ge 90$ is achievable on seeded data.

## Trade-offs
- Requires splitting monolithic pages into isolated modular server components with dedicated fallback components.

## Testing Strategy
- Next.js build verification verifying dynamic route generation and Partial Prerendering (`◐`).
- Visual regression inspection and Lighthouse performance audit.

