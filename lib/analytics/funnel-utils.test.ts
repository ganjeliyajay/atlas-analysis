import { describe, it, expect } from "vitest";

import {
  calculateFunnel,
  type FunnelEvent,
  type FunnelStep,
} from "./funnel-utils";

const steps: FunnelStep[] = [
  {
    name: "Page View",
    type: "event",
    value: "page_view",
  },
  {
    name: "Signup",
    type: "event",
    value: "user_signup",
  },
  {
    name: "Login",
    type: "event",
    value: "user_login",
  },
];

function createEvent(
  userId: string,
  eventName: string,
  minutes: number
): FunnelEvent {
  return {
    userId,
    sessionId: `session-${userId}`,
    eventName,
    pageUrl: null,
    createdAt: new Date(
      `2026-10-01T10:${String(minutes).padStart(2, "0")}:00Z`
    ),
  };
}

function getStep(result: ReturnType<typeof calculateFunnel>, index: number) {
  const step = result.steps[index];
  if (!step) throw new Error(`Step at index ${index} does not exist`);
  return step;
}

describe("Funnel Analytics", () => {
  it("should calculate 100% conversion when all users complete every step", () => {
    const events = [
      createEvent("user1", "page_view", 0),
      createEvent("user1", "user_signup", 1),
      createEvent("user1", "user_login", 2),
    ];

    const result = calculateFunnel(events, steps, 7);

    expect(result.summary.totalUsers).toBe(1);
    expect(result.summary.convertedUsers).toBe(1);
    expect(result.summary.overallConversionRate).toBe(100);

    expect(getStep(result, 0).users).toBe(1);
    expect(getStep(result, 1).users).toBe(1);
    expect(getStep(result, 2).users).toBe(1);
  });

  it("should calculate drop-off when users do not complete all steps", () => {
    const events = [
      createEvent("user1", "page_view", 0),
      createEvent("user1", "user_signup", 1),
      createEvent("user2", "page_view", 2),
    ];

    const result = calculateFunnel(events, steps, 7);

    expect(getStep(result, 0).users).toBe(2);
    expect(getStep(result, 1).users).toBe(1);
    expect(getStep(result, 2).users).toBe(0);

    expect(result.summary.totalUsers).toBe(2);
    expect(result.summary.convertedUsers).toBe(0);
    expect(result.summary.overallConversionRate).toBe(0);
    expect(result.summary.overallDropOffRate).toBe(100);
  });

  it("should not convert users when events occur in the wrong order", () => {
    const events = [
      // User never completes the first step
      createEvent("user1", "user_signup", 0),
      createEvent("user1", "user_login", 1),
    ];

    const result = calculateFunnel(events, steps, 7);

    expect(result.summary.totalUsers).toBe(0);
    expect(result.summary.convertedUsers).toBe(0);
    expect(result.summary.overallConversionRate).toBe(0);
  });

  it("should not convert users when conversion window is exceeded", () => {
    const events = [
      createEvent("user1", "page_view", 0),
      {
        ...createEvent("user1", "user_signup", 1),
        createdAt: new Date("2026-10-10T10:00:00Z"),
      },
    ];

    const result = calculateFunnel(events, steps, 1);

    expect(getStep(result, 0).users).toBe(1);
    expect(getStep(result, 1).users).toBe(0);
  });

  it("should return zero values when there are no events", () => {
    const result = calculateFunnel([], steps, 7);

    expect(result.summary.totalUsers).toBe(0);
    expect(result.summary.convertedUsers).toBe(0);
    expect(result.summary.overallConversionRate).toBe(0);
    expect(result.summary.overallDropOffRate).toBe(0);
  });

  it("should ignore events without userId", () => {
    const events: FunnelEvent[] = [
      {
        userId: null,
        sessionId: "session-1",
        eventName: "page_view",
        pageUrl: null,
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
    ];

    const result = calculateFunnel(events, steps, 7);

    expect(result.summary.totalUsers).toBe(0);
  });

  it("should measure conversion window from the first funnel step", () => {
    const events = [
      createEvent("user1", "page_view", 0),
      createEvent("user1", "user_signup", 1),
      {
        ...createEvent("user1", "user_login", 2),
        createdAt: new Date("2026-10-09T10:00:00Z"),
      },
    ];

    const result = calculateFunnel(events, steps, 7);

    expect(getStep(result, 0).users).toBe(1);
    expect(getStep(result, 1).users).toBe(1);
    expect(getStep(result, 2).users).toBe(0);
  });

  it("should count multiple users independently", () => {
    const events = [
      createEvent("user1", "page_view", 0),
      createEvent("user1", "user_signup", 1),
      createEvent("user1", "user_login", 2),

      createEvent("user2", "page_view", 3),
      createEvent("user2", "user_signup", 4),

      createEvent("user3", "page_view", 5),
    ];

    const result = calculateFunnel(events, steps, 7);

    expect(getStep(result, 0).users).toBe(3);
    expect(getStep(result, 1).users).toBe(2);
    expect(getStep(result, 2).users).toBe(1);

    expect(result.summary.totalUsers).toBe(3);
    expect(result.summary.convertedUsers).toBe(1);
    expect(result.summary.overallConversionRate).toBe(33.33);
  });

  it("should not count events that skip the expected next step", () => {
    const events = [
      createEvent("user1", "page_view", 0),
      createEvent("user1", "user_login", 1),
    ];

    const result = calculateFunnel(events, steps, 7);

    expect(getStep(result, 0).users).toBe(1);
    expect(getStep(result, 1).users).toBe(0);
    expect(getStep(result, 2).users).toBe(0);
  });

  it("should allow users to complete steps exactly at the conversion window boundary", () => {
    const events = [
      {
        ...createEvent("user1", "page_view", 0),
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        ...createEvent("user1", "user_signup", 1),
        createdAt: new Date("2026-10-08T10:00:00Z"),
      },
    ];

    const result = calculateFunnel(events, steps, 7);

    expect(getStep(result, 0).users).toBe(1);
    expect(getStep(result, 1).users).toBe(1);
  });
});
