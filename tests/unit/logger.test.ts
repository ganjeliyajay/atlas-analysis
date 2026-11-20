import { describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";

describe("Structured Logger and Redaction", () => {
  it("generates 16-character request IDs", () => {
    const id = logger.createRequestId();
    expect(id).toMatch(/^req_[a-f0-9]{16}$/);
  });

  it("redacts sensitive fields such as passwords, tokens, and raw API keys", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("Test login event", {
      userId: "usr_123",
      tenantId: "org_456",
      password: "SuperSecretPassword123!",
      apiKey: "atlas_live_abcdef1234567890",
      authorization: "Bearer sensitive-jwt-token",
      cookie: "session_token=abc123xyz",
      invitationToken: "inv_secret_999",
      nested: {
        token: "nested-token-value",
        secret: "my-secret-key",
        normalField: "public-value",
        tokenArray: ["sensitive-item-1", "sensitive-item-2"],
      },
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.parse(consoleSpy.mock.calls[0]?.[0] as string);

    expect(loggedJson.level).toBe("info");
    expect(loggedJson.message).toBe("Test login event");
    expect(loggedJson.userId).toBe("usr_123");
    expect(loggedJson.password).toBe("[REDACTED]");
    expect(loggedJson.authorization).toBe("[REDACTED]");
    expect(loggedJson.cookie).toBe("[REDACTED]");
    expect(loggedJson.invitationToken).toBe("[REDACTED]");
    expect(loggedJson.nested.token).toBe("[REDACTED]");
    expect(loggedJson.nested.secret).toBe("[REDACTED]");
    expect(loggedJson.nested.normalField).toBe("public-value");

    consoleSpy.mockRestore();
  });
});
