# ATLAS — REST & Ingestion API Documentation

## 1. Authentication Model

ATLAS supports two distinct authentication schemes:

1. **Dedicated Ingestion API Keys (`atlas_live_...`):**
   - Passed via `Authorization: Bearer atlas_live_<key>`. Query-string API keys are not accepted because URLs can be retained in access logs and browser history.
   - Keys are hashed with salted **scrypt** and prefix-indexed for $O(1)$ constant-time lookup.
2. **Session Authentication (Dashboard & Ops Console):**
   - Encrypted HTTP-only session cookies managed by **Auth.js v5**.
   - Authenticated user membership in the requested organization is verified on every request.

---

## 2. Standard Rate Limiting Headers

Every ingestion response includes machine-readable rate-limiting headers:

| Header | Description | Example |
|---|---|---|
| `X-RateLimit-Limit` | Maximum token bucket capacity | `10000` |
| `X-RateLimit-Remaining` | Remaining available tokens | `9950` |
| `X-RateLimit-Reset` | Timestamp when bucket will be fully refilled | `1794500000` |
| `Retry-After` | Seconds to wait before retrying (present on 429) | `5` |

---

## 3. Event Ingestion API

### Ingest Single or Batch Events
`POST /api/v1/events` (or `POST /api/events`)

**Headers:**
```http
Authorization: Bearer atlas_live_your_api_key_here
Content-Type: application/json
Idempotency-Key: idemp_unique_token_12345 (Optional, max 255 chars)
```

**Single Event Request:**
```json
{
  "eventName": "checkout_completed",
  "userId": "usr_99812",
  "sessionId": "sess_81729",
  "properties": {
    "cartTotal": 149.50,
    "currency": "USD",
    "itemCount": 3
  },
  "pageUrl": "/checkout/success",
  "country": "US",
  "device": "desktop",
  "browser": "Chrome"
}
```

**Batch Request (Up to 500 events):**
```json
{
  "events": [
    {
      "eventName": "page_view",
      "userId": "usr_99812",
      "pageUrl": "/pricing"
    },
    {
      "eventName": "signup_started",
      "userId": "usr_99812",
      "pageUrl": "/signup"
    }
  ]
}
```

**Success Response (HTTP 202 Accepted):**
```json
{
  "message": "Events ingested successfully",
  "accepted": 2,
  "quota": {
    "limit": 100000,
    "used": 1450,
    "remaining": 98550,
    "resetAt": "2026-12-01T00:00:00.000Z"
  }
}
```

**Idempotency Duplicate Response (HTTP 202 Accepted):**
```json
{
  "message": "Events already ingested (idempotent replay)",
  "accepted": 2,
  "quota": { "limit": 100000, "used": 1450, "remaining": 98550, "resetAt": "2026-12-01T00:00:00.000Z" }
}
```

**Idempotency Conflict Response (HTTP 409 Conflict):**
```json
{
  "error": "Idempotency key reused with a different payload",
  "idempotencyKey": "idemp_unique_token_12345"
}
```

**Rate Limit Exceeded (HTTP 429 Too Many Requests):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Event ingestion rate limit exceeded.",
  "retryAfterSeconds": 5
}
```

**Quota Exceeded (HTTP 429 Too Many Requests):**
```json
{
  "error": "quota_exceeded",
  "message": "Monthly event quota exceeded for this organization.",
  "quota": {
    "limit": 100000,
    "used": 100000,
    "remaining": 0,
    "resetAt": "2026-12-01T00:00:00.000Z"
  }
}
```

**Tenant Suspended (HTTP 403 Forbidden):**
```json
{
  "error": "tenant_suspended",
  "message": "Organization tenant is suspended. Event ingestion is disabled."
}
```

---

## 4. Analytics Query Endpoints (Authenticated Session)

### Overview Dashboard Metrics
`GET /api/dashboard?range=30d&projectId=All`

**Query Parameters:**
- `range`: `today` | `7d` | `30d` | `90d` | `custom`
- `startDate`: `YYYY-MM-DD` (for custom range)
- `endDate`: `YYYY-MM-DD` (for custom range)
- `projectId`: Organization project ID or `All`
- `eventName`: Filter by event name
- `userId`: Filter by user identifier

**Response (HTTP 200 OK):**
```json
{
  "range": "30d",
  "kpis": {
    "totalEvents": 48291,
    "activeUsers": 3120,
    "dau": 840,
    "wau": 2210,
    "mau": 3120
  },
  "changes": {
    "totalEvents": 14.2,
    "activeUsers": 8.7
  },
  "topEvents": [
    { "name": "page_view", "count": 21000, "percentage": 43.5 },
    { "name": "button_clicked", "count": 12000, "percentage": 24.8 }
  ],
  "eventsOverTime": [
    { "date": "2026-10-15T00:00:00.000Z", "eventVolume": 1500 }
  ],
  "activeUsersOverTime": [
    { "date": "2026-10-15T00:00:00.000Z", "activeUsers": 320 }
  ]
}
```

### Streaming CSV Export
`GET /api/analytics/events/export?range=30d&projectId=All`

**Headers:**
```http
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="atlas-events-<tenant>-<date>.csv"
Transfer-Encoding: chunked
```
Streams RFC 4180-compliant CSV lines with UTF-8 BOM and spreadsheet formula injection sanitization.

### Live Server-Sent Events (SSE)
`GET /api/analytics/live?limit=40&projectId=All`

**Headers:**
```http
Accept: text/event-stream
```

**Stream Chunks:**
```http
data: {"success":true,"data":{"events":[...]}}

: keepalive

data: {"success":true,"data":{"events":[...]}}
```

### Funnel Analysis
`GET /api/analytics/funnels?steps=page_view,signup_started,purchase&range=30d&conversionWindowDays=7`

**Response (HTTP 200 OK):**
```json
{
  "funnel": [
    { "step": "page_view", "users": 1000, "conversionRate": 100, "dropOff": 0 },
    { "step": "signup_started", "users": 450, "conversionRate": 45, "dropOff": 55 },
    { "step": "purchase", "users": 180, "conversionRate": 18, "dropOff": 60 }
  ]
}
```

### Cohort Retention
`GET /api/analytics/retention?period=weekly&metric=any_event`

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "data": {
    "cohorts": [
      {
        "cohortDate": "2026-10-05",
        "cohortSize": 500,
        "periods": [100, 42.5, 31.0, 24.5, 19.0, null]
      }
    ]
  }
}
```

---

## 5. Operations Console API (Superadmin Only)

### Platform Telemetry
`GET /api/ops?page=1&limit=10&status=All&range=30d`

### Tenant Suspension & Quota Management
`PATCH /api/ops/tenants/:id`

**Payload:**
```json
{
  "status": "suspended",
  "eventQuota": 250000,
  "suspendedReason": "Account under investigation"
}
```

---

## 6. Scheduled Rollup Worker

`POST /api/cron/rollups`

**Headers:**
```http
Authorization: Bearer <CRON_SECRET>
```
Executes idempotent 72-hour hourly and 90-day daily rollups.

