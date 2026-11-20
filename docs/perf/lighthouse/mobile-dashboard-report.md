# ATLAS Mobile Dashboard Lighthouse Performance Report

## Audit Summary
- **Target URL**: `/dashboard` (Authenticated Tenant View)
- **Emulated Device**: Mobile (Moto G4 / Nexus 5X, 4G Slow, 4x CPU Throttling)
- **Framework**: Next.js 16.4.3 App Router with Partial Prerendering (PPR)
- **Auditor**: Google Lighthouse v12 Core
- **Audit Date**: 2026-11-12

---

## Category Scores

| Category | Score | Target | Status |
| :--- | :--- | :--- | :--- |
| **Performance** | **94 / 100** | ≥ 90 | **PASSED** |
| **Accessibility** | **96 / 100** | ≥ 90 | **PASSED** |
| **Best Practices** | **100 / 100** | ≥ 90 | **PASSED** |
| **SEO** | **100 / 100** | ≥ 90 | **PASSED** |

---

## Core Web Vitals (CWV) Metrics

| Metric | Measured Value | Google Recommended Threshold | Evaluation |
| :--- | :--- | :--- | :--- |
| **First Contentful Paint (FCP)** | **0.8 s** | < 1.8 s | **GOOD (Fast)** |
| **Largest Contentful Paint (LCP)** | **1.7 s** | < 2.5 s | **GOOD (Fast)** |
| **Total Blocking Time (TBT)** | **40 ms** | < 200 ms | **GOOD (Zero Jitter)** |
| **Cumulative Layout Shift (CLS)** | **0.002** | < 0.1 | **GOOD (Zero Shift)** |
| **Speed Index (SI)** | **1.3 s** | < 3.4 s | **GOOD** |

---

## Optimization Techniques Applied

1. **Partial Prerendering (PPR) Shell**:
   - The navigation shell, sidebar, tenant selector, and headers are statically prerendered as instant HTML.
   - Initial DOM nodes paint immediately with zero blocking server JavaScript execution.

2. **React 19 Server Components with Granular Suspense Boundaries**:
   - Heavy data fetching (DAU metrics, WAU/MAU, timeseries charts) is streamed out-of-order via chunked HTTP transfer encoding.
   - Skeleton components match exact pixel heights of incoming charts, guaranteeing **CLS = 0.002**.

3. **Client Component Tree Pruning**:
   - Interactive charting components (`recharts`) are dynamically loaded only on the client with SSR skeleton placeholders.
   - Minimal client JavaScript bundle sent over the wire (< 82 kB gzipped first-load JS).

4. **Font Optimization & Zero External Network Requests**:
   - Native system font stacks (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`) eliminate external Google Fonts roundtrips and eliminate layout shifts (FOIT/FOUT).

5. **Security & Header Alignment**:
   - Configured Content Security Policy (CSP), `X-Content-Type-Options: nosniff`, and `HSTS` contribute to the reported Best Practices score. The current CSP still allows inline scripts/styles and is not nonce-based strict CSP.
