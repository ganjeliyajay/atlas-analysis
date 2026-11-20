import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DevelopmentEmailProvider,
  ResendEmailProvider,
  createEmailProvider,
} from "@/lib/email";

describe("Email Provider System", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("DevelopmentEmailProvider", () => {
    it("dispatches invitation successfully without throwing", async () => {
      const provider = new DevelopmentEmailProvider();
      const result = await provider.sendInvitationEmail({
        to: "teammate@example.com",
        organizationName: "Acme Corp",
        inviterName: "Alice Admin",
        role: "admin",
        inviteToken: "raw-secret-token-abcdef1234567890",
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  describe("ResendEmailProvider", () => {
    it("sends HTTP request to Resend API endpoint", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "resend-msg-12345" }),
      });
      global.fetch = mockFetch;

      const provider = new ResendEmailProvider("re_123456789", "sender@customdomain.com");
      const result = await provider.sendInvitationEmail({
        to: "recipient@example.com",
        organizationName: "Stark Enterprises",
        inviterName: "Tony Stark",
        role: "viewer",
        inviteToken: "sec_token_99999",
        expiresAt: new Date("2026-12-31T00:00:00Z"),
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("resend-msg-12345");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [url, options] = firstCall as [string, RequestInit & { headers: Record<string, string>; body: string }];
      expect(url).toBe("https://api.resend.com/emails");
      expect(options.headers.Authorization).toBe("Bearer re_123456789");

      const body = JSON.parse(options.body);
      expect(body.to).toEqual(["recipient@example.com"]);
      expect(body.from).toBe("sender@customdomain.com");
      expect(body.subject).toContain("Stark Enterprises");
      expect(body.html).toContain("Tony Stark");
      expect(body.html).toContain("viewer");
    });

    it("handles Resend API rejection gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "Domain not verified" }),
      });
      global.fetch = mockFetch;

      const provider = new ResendEmailProvider("re_invalid");
      const result = await provider.sendInvitationEmail({
        to: "fail@example.com",
        organizationName: "Failed Org",
        inviterName: "Inviter",
        role: "viewer",
        inviteToken: "tok",
        expiresAt: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Resend API error (403)");
    });
  });

  describe("createEmailProvider factory", () => {
    it("defaults to DevelopmentEmailProvider when no RESEND_API_KEY is configured", () => {
      delete process.env.RESEND_API_KEY;
      const provider = createEmailProvider();
      expect(provider.name).toBe("development");
    });

    it("creates ResendEmailProvider when RESEND_API_KEY is present", () => {
      process.env.RESEND_API_KEY = "re_live_test_key_123";
      const provider = createEmailProvider();
      expect(provider.name).toBe("resend");
    });
  });
});
