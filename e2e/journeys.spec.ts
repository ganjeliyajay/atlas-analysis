import { test, expect } from "@playwright/test";

test.describe.serial("ATLAS Analytics - Complete User Journeys (A through F)", () => {
  const runId = Date.now();
  const ownerUser = {
    name: `Architect ${runId}`,
    email: `architect_${runId}@atlas-enterprise.io`,
    password: "SecurePassWord123!@#",
    projectName: `Project Alpha ${runId}`,
    projectUrl: "https://alpha.atlas-enterprise.io",
  };

  const secondUser = {
    name: `Tenant Two ${runId}`,
    email: `tenant2_${runId}@rival-corp.io`,
    password: "SecurePassWord123!@#",
  };

  let generatedApiKey = "";

  test.beforeEach(async ({ page }) => {
    // Automatically accept any browser alert/confirm dialogues
    page.on("dialog", async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        // Dialogue already handled
      }
    });
  });

  // -------------------------------------------------------------
  // JOURNEY A: Landing -> Register -> Workspace -> Logout -> Guard
  // -------------------------------------------------------------
  test("Journey A: Landing, Registration, Dashboard, Logout, and Route Protection", async ({ page }) => {
    // 1. Visit landing page
    await page.goto("/");
    await expect(page).toHaveTitle(/Atlas/i);
    await expect(page.locator("body")).toContainText(/Atlas Analytics|PostgreSQL/i);

    // 2. Click Register / Get Started CTA
    const getStartedLink = page.locator('a[href="/register"]').first();
    await getStartedLink.click();
    await expect(page).toHaveURL(/\/register/);

    // 3. Register a new user
    await page.locator('input[placeholder="Jay Vora"]').fill(ownerUser.name);
    await page.locator('input[placeholder="jay@company.io"]').fill(ownerUser.email);
    await page.locator('input[placeholder="At least 8 characters"]').fill(ownerUser.password);
    await page.locator('input[placeholder="Repeat your password"]').fill(ownerUser.password);

    await page.locator('button[type="submit"]').click();

    // 4. Verify landing on dashboard or login, and ensure user is authenticated
    await expect(page).toHaveURL(/\/(dashboard|login)/, { timeout: 20_000 });
    if (page.url().includes("/login")) {
      await page.locator('input[placeholder="name@company.com"]').fill(ownerUser.email);
      await page.locator('input[placeholder="••••••••••••"]').fill(ownerUser.password);
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    }
    await expect(page.locator("body")).toBeVisible();

    // 5. Logout & Verify protected route redirect when unauthenticated
    const logoutBtn = page.locator('button[title="Logout"], button:has-text("Logout"), button:has-text("Sign Out")').first();
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    }
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  // -------------------------------------------------------------
  // JOURNEY B: Login -> Create Project -> Generate API Key
  // -------------------------------------------------------------
  test("Journey B: Create Project and Generate Ingestion API Key", async ({ page }) => {
    // 1. Login
    await page.goto("/login");
    await page.locator('input[placeholder="name@company.com"]').fill(ownerUser.email);
    await page.locator('input[placeholder="••••••••••••"]').fill(ownerUser.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // 2. Navigate to Projects
    await page.goto("/dashboard/projects");
    await expect(page.locator("h1").first()).toContainText(/Projects/i);

    // 3. Create Project
    const createProjectBtn = page.locator("button", { hasText: /New Project|Create Project/i }).first();
    await createProjectBtn.click();

    await page.locator('input[placeholder*="Employee Portal"]').fill(ownerUser.projectName);
    await page.locator('input[type="url"]').fill(ownerUser.projectUrl);
    await page.locator('button[type="submit"]', { hasText: /Create Project/i }).click();

    // Verify project created modal and close it
    const doneBtn = page.getByRole("button", { name: "Done" });
    if (await doneBtn.count() > 0) {
      await doneBtn.click();
    }

    // Verify project appears
    await expect(page.locator("body")).toContainText(ownerUser.projectName, { timeout: 10_000 });

    // 4. Navigate to API Keys
    await page.goto("/dashboard/api-keys");
    await expect(page.locator("h1").first()).toContainText(/API Keys/i);

    // Generate Key
    const generateKeyBtn = page.getByRole("button", { name: "Generate API Key" }).first();
    await generateKeyBtn.click();

    await page.locator('input[placeholder="e.g. Production Web Ingestion"]').fill(`Key for ${ownerUser.projectName}`);
    await page.locator('button[type="submit"]', { hasText: /Generate API Key/i }).click();

    // Verify secret displayed
    const secretCode = page.locator("code", { hasText: /atlas_live_/i });
    await expect(secretCode).toBeVisible({ timeout: 10_000 });
    generatedApiKey = (await secretCode.innerText()).trim();
    expect(generatedApiKey).toMatch(/^atlas_live_[a-f0-9]{64}$/);

    // Close modal
    const closeSecretBtn = page.getByRole("button", { name: "Done" });
    if (await closeSecretBtn.count() > 0) {
      await closeSecretBtn.click();
    }
  });

  // -------------------------------------------------------------
  // JOURNEY C: Ingest Event -> Live Stream & Events Dashboard
  // -------------------------------------------------------------
  test("Journey C: Telemetry Ingestion and Analytics View", async ({ page, request }) => {
    expect(generatedApiKey).toBeTruthy();

    // 1. Send live event via public ingestion API
    const ingestRes = await request.post("/api/v1/events", {
      headers: {
        Authorization: `Bearer ${generatedApiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        eventName: "journey_c_checkout_completed",
        userId: "user_journey_c_42",
        sessionId: "sess_c_99",
        pageUrl: "https://alpha.atlas-enterprise.io/checkout/success",
        properties: {
          plan: "enterprise",
          revenue: 299,
          currency: "USD",
        },
      },
    });

    expect([200, 202]).toContain(ingestRes.status());
    const ingestJson = await ingestRes.json();
    expect(ingestJson.accepted).toBeGreaterThanOrEqual(1);

    // 2. Login to view dashboard
    await page.goto("/login");
    await page.locator('input[placeholder="name@company.com"]').fill(ownerUser.email);
    await page.locator('input[placeholder="••••••••••••"]').fill(ownerUser.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // 3. Visit Live Stream
    await page.goto("/dashboard/live");
    await expect(page.locator("h1").first()).toContainText(/Live|Real-Time/i);

    // 4. Visit Events Explorer
    await page.goto("/dashboard/events");
    await expect(page.locator("h1").first()).toContainText(/Events/i);
    await expect(page.locator("body")).toBeVisible();
  });

  // -------------------------------------------------------------
  // JOURNEY D: Multi-Tenant Isolation
  // -------------------------------------------------------------
  test("Journey D: Cross-Tenant Isolation Enforcement", async ({ page }) => {
    // 1. Register a second tenant
    await page.goto("/register");
    await page.locator('input[placeholder="Jay Vora"]').fill(secondUser.name);
    await page.locator('input[placeholder="jay@company.io"]').fill(secondUser.email);
    await page.locator('input[placeholder="At least 8 characters"]').fill(secondUser.password);
    await page.locator('input[placeholder="Repeat your password"]').fill(secondUser.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/(dashboard|login)/, { timeout: 20_000 });
    if (page.url().includes("/login")) {
      await page.locator('input[placeholder="name@company.com"]').fill(secondUser.email);
      await page.locator('input[placeholder="••••••••••••"]').fill(secondUser.password);
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    }

    // 2. Second tenant goes to projects; should NOT see ownerUser.projectName
    await page.goto("/dashboard/projects");
    await expect(page.locator("body")).not.toContainText(ownerUser.projectName);

    // 3. Second tenant goes to API keys; should NOT see owner's key
    await page.goto("/dashboard/api-keys");
    await expect(page.locator("body")).not.toContainText(`Key for ${ownerUser.projectName}`);
  });

  // -------------------------------------------------------------
  // JOURNEY E: Settings & Team Invitations
  // -------------------------------------------------------------
  test("Journey E: Organization Settings and Team Invitation Flow", async ({ page }) => {
    // 1. Login as owner
    await page.goto("/login");
    await page.locator('input[placeholder="name@company.com"]').fill(ownerUser.email);
    await page.locator('input[placeholder="••••••••••••"]').fill(ownerUser.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // 2. Navigate to Settings
    await page.goto("/dashboard/settings");
    await expect(page.locator("h1").first()).toContainText(/Settings/i);

    // 3. Switch to Team tab
    const teamTab = page.locator("button", { hasText: /Team/i });
    if (await teamTab.count() > 0) {
      await teamTab.click();
      await expect(page.locator("body")).toContainText(/Organization Members|Members/i);

      // Open Invite modal
      const inviteBtn = page.locator("button", { hasText: /Invite Teammate|Invite Member/i }).first();
      await inviteBtn.click();

      // Fill invitation
      const inviteEmail = `colleague_${runId}@atlas-enterprise.io`;
      await page.locator('input[placeholder="colleague@yourcompany.com"]').fill(inviteEmail);
      await page.locator('button[type="submit"]', { hasText: /Send Invitation/i }).click();

      // Verify invitation listed
      await expect(page.locator("body")).toContainText(inviteEmail, { timeout: 10_000 });
    }
  });

  // -------------------------------------------------------------
  // JOURNEY F: Responsive Viewport Verification
  // -------------------------------------------------------------
  test("Journey F: Responsive Design Verification across Viewports", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[placeholder="name@company.com"]').fill(ownerUser.email);
    await page.locator('input[placeholder="••••••••••••"]').fill(ownerUser.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    const viewports = [
      { name: "Desktop (1920x1080)", width: 1920, height: 1080 },
      { name: "Laptop (1440x900)", width: 1440, height: 900 },
      { name: "Tablet (768x1024)", width: 768, height: 1024 },
      { name: "Mobile (390x844)", width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(500);

      // Verify dashboard content is visible
      await expect(page.locator("body")).toBeVisible();

      if (vp.width < 768) {
        // On mobile screens (< 768px md breakpoint), verify responsive mobile navigation toggle button is visible
        const mobileToggle = page.locator('button[aria-label="Open navigation"]');
        await expect(mobileToggle).toBeVisible();
      }
    }
  });
});
