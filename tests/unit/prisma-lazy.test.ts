import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Lazy Prisma Architecture & Strict Role Isolation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should not initialize PrismaClient or throw upon module import when env vars are missing", async () => {
    delete process.env.DATABASE_URL_APP;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_OPS;
    delete process.env.DATABASE_URL_MIGRATION;

    // Importing the module should succeed cleanly with zero side-effects
    const { prisma } = await import("@/lib/prisma");
    const { prismaOps } = await import("@/lib/prisma-ops");

    expect(prisma).toBeDefined();
    expect(prismaOps).toBeDefined();
    expect(Reflect.get(prisma, "then")).toBeUndefined();
    expect(Reflect.get(prismaOps, "then")).toBeUndefined();
    expect((prisma as unknown as { __esModule: unknown }).__esModule).toBeUndefined();
    expect(Object.prototype.toString.call(prisma)).toBe("[object PrismaClient]");
    expect(Object.prototype.toString.call(prismaOps)).toBe("[object PrismaClient]");
  });

  it("should fail clearly at runtime when a database operation is attempted without DATABASE_URL_APP", async () => {
    delete process.env.DATABASE_URL_APP;
    delete process.env.DATABASE_URL;

    // Clear global cache
    delete (globalThis as unknown as { prisma?: unknown }).prisma;

    const { prisma } = await import("@/lib/prisma");

    expect(() => {
      // Accessing a model delegate or client method triggers credential check
      prisma.user.findFirst();
    }).toThrow("DATABASE_URL_APP is required. Configure the dedicated least-privilege atlas_app database role.");
  });

  it("should strictly refuse fallback to generic DATABASE_URL when DATABASE_URL_APP is absent", async () => {
    delete process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL = "postgresql://postgres:fake@localhost:5432/atlas_analytics_test";

    delete (globalThis as unknown as { prisma?: unknown }).prisma;

    const { prisma } = await import("@/lib/prisma");

    expect(() => {
      prisma.user.findFirst();
    }).toThrow("DATABASE_URL_APP is required. Configure the dedicated least-privilege atlas_app database role.");
  });

  it("should fail clearly at runtime when a database operation is attempted without DATABASE_URL_OPS", async () => {
    delete process.env.DATABASE_URL_OPS;
    delete process.env.DATABASE_URL_MIGRATION;
    delete process.env.DATABASE_URL;

    // Clear global cache
    delete (globalThis as unknown as { opsPrisma?: unknown }).opsPrisma;

    const { prismaOps } = await import("@/lib/prisma-ops");

    expect(() => {
      prismaOps.auditLog.findFirst();
    }).toThrow("DATABASE_URL_OPS is required. Configure the dedicated least-privilege atlas_ops database role.");
  });

  it("should strictly refuse fallback to DATABASE_URL_MIGRATION or generic DATABASE_URL when DATABASE_URL_OPS is absent", async () => {
    delete process.env.DATABASE_URL_OPS;
    process.env.DATABASE_URL_MIGRATION = "postgresql://postgres:fake@localhost:5432/atlas_analytics_test";
    process.env.DATABASE_URL = "postgresql://postgres:fake@localhost:5432/atlas_analytics_test";

    delete (globalThis as unknown as { opsPrisma?: unknown }).opsPrisma;

    const { prismaOps } = await import("@/lib/prisma-ops");

    expect(() => {
      prismaOps.auditLog.findFirst();
    }).toThrow("DATABASE_URL_OPS is required. Configure the dedicated least-privilege atlas_ops database role.");
  });

  it("should correctly forward and bind client operations when environment is configured", async () => {
    process.env.DATABASE_URL_APP = "postgresql://atlas_app@localhost:5432/atlas_analytics_test";
    process.env.DATABASE_URL_OPS = "postgresql://atlas_ops@localhost:5432/atlas_analytics_test";

    const { prisma } = await import("@/lib/prisma");
    const { prismaOps } = await import("@/lib/prisma-ops");

    // Operations are bound to the underlying client instances
    expect(typeof prisma.$queryRaw).toBe("function");
    expect(typeof prisma.$transaction).toBe("function");
    expect(prisma.user).toBeDefined();

    expect(typeof prismaOps.$queryRaw).toBe("function");
    expect(typeof prismaOps.$transaction).toBe("function");
    expect(prismaOps.auditLog).toBeDefined();
  });
});
