const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testSuite() {
  console.log("==================================================");
  console.log(`FULL E2E AUDIT TESTING LIVE SERVER AT ${BASE_URL}`);
  console.log("==================================================\n");

  let testPassed = 0;
  let testFailed = 0;

  async function check(name, testFn) {
    try {
      await testFn();
      testPassed++;
      console.log(`[PASS] ${name}`);
    } catch (err) {
      testFailed++;
      console.error(`[FAIL] ${name}:`, err.message || err);
    }
  }

  // 1. Health check
  await check("Health Endpoint /api/health", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== "healthy" && data.status !== "success") throw new Error(`Unexpected status: ${data.status}`);
  });

  // 2. Register Endpoint validation
  await check("Register - Missing fields validation", async () => {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: "", workEmail: "invalid", password: "123" }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // 3. Register Endpoint success
  const testEmail = `e2e_full_${Date.now()}@testcorp.internal`;
  const testPassword = "AuditPassword123!";
  let registeredUser;
  await check("Register - Successful account & workspace creation", async () => {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: "E2E Full Audit User",
        workEmail: testEmail,
        password: testPassword,
      }),
    });
    if (res.status !== 201) {
      const err = await res.json();
      throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(err)}`);
    }
    const data = await res.json();
    if (!data.user?.id || !data.organization?.id) {
      throw new Error("Missing user or organization in response");
    }
    registeredUser = data;
  });

  // 4. Duplicate registration prevention
  await check("Register - Prevent duplicate email", async () => {
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: "Duplicate User",
        workEmail: testEmail,
        password: testPassword,
      }),
    });
    if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
  });

  // 5. Ingestion without auth header
  await check("Event Ingestion - Missing Authorization Header", async () => {
    const res = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: "test" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 6. Ingestion with invalid API key
  await check("Event Ingestion - Invalid API Key", async () => {
    const res = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer atl_live_invalid_fake_key_99999',
      },
      body: JSON.stringify({ eventName: "test" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === null) throw new Error("Missing rate limit header");
  });

  // 7. Unauthenticated access to protected routes
  await check("Protected Route /api/organization/current - Unauthorized", async () => {
    const res = await fetch(`${BASE_URL}/api/organization/current`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check("Protected Route /api/projects - Unauthorized", async () => {
    const res = await fetch(`${BASE_URL}/api/projects`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check("Protected Route /api/dashboard - Unauthorized", async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check("Protected Route /api/analytics/events - Unauthorized", async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/events`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await check("Protected Route /api/analytics/live - Unauthorized", async () => {
    const res = await fetch(`${BASE_URL}/api/analytics/live`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 8. Authentication via NextAuth Credentials Callback
  let sessionCookie = '';
  await check("NextAuth - Sign in via Credentials", async () => {
    // 8a. Fetch CSRF token
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    if (!csrfRes.ok) throw new Error(`CSRF fetch failed: ${csrfRes.status}`);
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;
    const csrfCookie = csrfRes.headers.get('set-cookie') || '';

    // 8b. Authenticate with credentials
    const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: csrfCookie,
      },
      body: new URLSearchParams({
        email: testEmail,
        password: testPassword,
        csrfToken,
      }),
      redirect: 'manual',
    });

    const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
    sessionCookie = setCookies.join('; ');
    if (!sessionCookie.includes('authjs.session-token') && !sessionCookie.includes('next-auth.session-token')) {
      throw new Error(`Session cookie not returned. Headers: ${JSON.stringify(setCookies)}`);
    }
  });

  // 9. Current Organization for Authenticated User
  let orgData;
  await check("Organization - Load Current Organization", async () => {
    const res = await fetch(`${BASE_URL}/api/organization/current`, {
      headers: { Cookie: sessionCookie },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.organization?.id) throw new Error("Organization not found in response");
    if (data.organization.role !== 'owner') throw new Error(`Expected role owner, got ${data.organization.role}`);
    orgData = data.organization;
  });

  // 10. Project Creation & API Key Generation
  let createdProject;
  let rawApiKey;
  await check("Projects - Create Project & Generate Ingest Key", async () => {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: `Production Web App ${Date.now()}`,
        websiteUrl: "https://audit-e2e.testcorp.internal",
        platform: "Next.js",
        description: "E2E automated testing project",
      }),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = await res.json();
    if (!data.project?.id || !data.apiKey) throw new Error("Missing project id or apiKey in response");
    createdProject = data.project;
    rawApiKey = data.apiKey;
  });

  // 11. Projects List
  await check("Projects - List Projects for Tenant", async () => {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Cookie: sessionCookie },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.projects)) throw new Error("Projects is not an array");
    const found = data.projects.find((p) => p.id === createdProject.id);
    if (!found) throw new Error("Created project not in listed projects");
  });

  // 12. Regenerate Ingest Key
  let secondApiKey;
  await check("Projects - Ingest Key Regeneration", async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${createdProject.id}/ingest-key`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.apiKey) throw new Error("Missing regenerated apiKey");
    secondApiKey = data.apiKey;
    if (secondApiKey === rawApiKey) throw new Error("New API key must differ from initial key");
  });

  // 13. Event Ingestion with Regenerated Key
  await check("Event Ingestion - Ingest Events via Ingestion Key", async () => {
    // Event 1
    const res1 = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secondApiKey}`,
      },
      body: JSON.stringify({
        eventName: "user_signup",
        userId: "e2e_user_101",
        sessionId: "sess_101",
        properties: { plan: "enterprise", referrer: "google" },
        pageUrl: "/signup",
        country: "US",
        device: "desktop",
        browser: "Chrome",
      }),
    });
    if (res1.status !== 202 && res1.status !== 201) {
      const err = await res1.json();
      throw new Error(`Ingest 1 failed ${res1.status}: ${JSON.stringify(err)}`);
    }

    // Event 2
    const res2 = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secondApiKey}`,
      },
      body: JSON.stringify({
        eventName: "payment_completed",
        userId: "e2e_user_102",
        sessionId: "sess_102",
        properties: { amount: 299, currency: "USD" },
        pageUrl: "/checkout",
        country: "GB",
        device: "mobile",
        browser: "Safari",
      }),
    });
    if (res2.status !== 202 && res2.status !== 201) throw new Error(`Ingest 2 failed ${res2.status}`);
  });

  // 14. Query Events Analytics API
  await check("Events Analytics - Query Data & Daily Aggregation", async () => {
    const res = await fetch(
      `${BASE_URL}/api/analytics/events?range=30d&projectId=${createdProject.id}&page=1&limit=10`,
      { headers: { Cookie: sessionCookie } }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error("Expected success: true");
    if (json.data.totalEvents < 2) throw new Error(`Expected at least 2 events, got ${json.data.totalEvents}`);
    if (json.data.activeUsers < 2) throw new Error(`Expected at least 2 active users, got ${json.data.activeUsers}`);
    if (!Array.isArray(json.data.dailyEvents)) throw new Error("Expected dailyEvents array");
    if (!Array.isArray(json.data.events)) throw new Error("Expected events array");
  });

  // 15. Query Live Analytics API
  await check("Live Analytics - Stream Latest Events with Project Scoping", async () => {
    const res = await fetch(
      `${BASE_URL}/api/analytics/live?limit=20&projectId=${createdProject.id}`,
      { headers: { Cookie: sessionCookie } }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error("Expected success: true");
    if (!Array.isArray(json.data.events) || json.data.events.length < 2) {
      throw new Error(`Expected >= 2 live events, got ${json.data?.events?.length}`);
    }
    const latest = json.data.events[0];
    if (!latest.eventName || !latest.projectName) {
      throw new Error("Missing eventName or projectName on live event");
    }
  });

  // 16. Query Dashboard Overview API
  await check("Dashboard API - Overview Metrics & KPIs", async () => {
    const res = await fetch(
      `${BASE_URL}/api/dashboard?range=30d&projectId=${createdProject.id}`,
      { headers: { Cookie: sessionCookie } }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (json.kpis.totalEvents < 2) throw new Error(`Expected totalEvents >= 2, got ${json.kpis.totalEvents}`);
    if (json.kpis.activeUsers < 2) throw new Error(`Expected activeUsers >= 2, got ${json.kpis.activeUsers}`);
    if (!Array.isArray(json.topEvents) || json.topEvents.length === 0) throw new Error("Missing topEvents");
    if (!Array.isArray(json.eventsOverTime)) throw new Error("Missing eventsOverTime");
    if (!Array.isArray(json.recentEvents)) throw new Error("Missing recentEvents");
  });

  // 17. Ingestion via /api/v1/events
  await check("Event Ingestion - /api/v1/events Alias", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secondApiKey}`,
      },
      body: JSON.stringify({
        eventName: "v1_test_event",
        userId: "e2e_v1_user",
        sessionId: "sess_v1",
      }),
    });
    if (res.status !== 202 && res.status !== 201) throw new Error(`v1 ingestion failed with status ${res.status}`);
  });

  // 18. Idempotency Key Replay
  await check("Event Ingestion - Idempotency Key Replay", async () => {
    const idKey = `idemp_${Date.now()}`;
    const payload = { eventName: "idemp_event", userId: "idemp_user" };
    const res1 = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secondApiKey}`,
        'Idempotency-Key': idKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res1.ok && res1.status !== 202) throw new Error(`First call failed: ${res1.status}`);

    const res2 = await fetch(`${BASE_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secondApiKey}`,
        'Idempotency-Key': idKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res2.ok && res2.status !== 202) throw new Error(`Replay call failed: ${res2.status}`);
  });

  // 19. CSV Export API
  await check("Events Analytics - CSV Export API /api/analytics/events/export", async () => {
    const res = await fetch(
      `${BASE_URL}/api/analytics/events/export?range=30d&projectId=${createdProject.id}`,
      { headers: { Cookie: sessionCookie } }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    if (!text.includes("Event Name") && !text.includes("eventName") && !text.includes("Id")) {
      throw new Error("CSV does not contain expected header row");
    }
  });

  // 20. Funnels API
  await check("Funnels Analytics API /api/analytics/funnels", async () => {
    const res = await fetch(
      `${BASE_URL}/api/analytics/funnels?range=30d&projectId=${createdProject.id}&steps=user_signup,payment_completed`,
      { headers: { Cookie: sessionCookie } }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.funnel)) throw new Error("Expected funnel array");
  });

  // 21. Retention API
  await check("Retention Analytics API /api/analytics/retention", async () => {
    const res = await fetch(
      `${BASE_URL}/api/analytics/retention?projectId=${createdProject.id}&period=weekly&metric=any_event`,
      { headers: { Cookie: sessionCookie } }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data.cohorts)) throw new Error("Expected cohorts array");
  });

  // 22. Pages API
  await check("Pages Analytics API /api/analytics/pages", async () => {
    const res = await fetch(
      `${BASE_URL}/api/analytics/pages?range=30d&projectId=${createdProject.id}`,
      { headers: { Cookie: sessionCookie } }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data.pages)) throw new Error("Expected pages array");
  });

  // 23. Users API
  await check("Users Analytics API /api/analytics/users", async () => {
    const res = await fetch(
      `${BASE_URL}/api/analytics/users?projectId=${createdProject.id}`,
      { headers: { Cookie: sessionCookie } }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data.users)) throw new Error("Expected users array");
  });

  // 24. Project Management - Update Project
  await check("Projects - PATCH Update Project Details", async () => {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        projectId: createdProject.id,
        name: "Renamed Project",
        description: "Updated description via audit test",
        platform: "React",
        websiteUrl: "https://renamed.testcorp.internal",
      }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.project?.name !== "Renamed Project") {
      throw new Error(`Expected name 'Renamed Project', got ${data.project?.name}`);
    }
  });

  // 18. Project Management - Delete Project
  await check("Projects - DELETE Project", async () => {
    const res = await fetch(`${BASE_URL}/api/projects?projectId=${createdProject.id}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Expected success: true");
  });

  console.log("\n==================================================");
  console.log(`FULL AUDIT COMPLETE: Passed: ${testPassed} | Failed: ${testFailed}`);
  console.log("==================================================");

  if (testFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

testSuite().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
