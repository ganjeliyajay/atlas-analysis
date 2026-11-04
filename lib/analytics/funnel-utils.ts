export type FunnelStep = {
  name: string;
  type: "event" | "page";
  value: string;
};

export type FunnelEvent = {
  userId: string | null;
  sessionId: string | null;
  eventName: string;
  pageUrl: string | null;
  createdAt: Date;
};

export type FunnelStepResult = {
  stepNumber: number;
  name: string;
  type: "event" | "page";
  value: string;
  users: number;
  conversionRate: number;
  dropOffUsers: number;
  dropOffRate: number;
  overallConversionRate: number;
};

export function matchesStep(
  event: FunnelEvent,
  step: FunnelStep
): boolean {
  if (step.type === "event") {
    return event.eventName === step.value;
  }

  return event.pageUrl === step.value;
}

export function calculateFunnel(
  events: FunnelEvent[],
  steps: FunnelStep[],
  conversionWindowDays: number
) {
  const userEvents = new Map<string, FunnelEvent[]>();

  // Group events by identified user
  for (const event of events) {
    if (!event.userId) continue;

    const existing = userEvents.get(event.userId) ?? [];

    existing.push(event);
    userEvents.set(event.userId, existing);
  }

  const stepCounts = Array.from(
    { length: steps.length },
    () => 0
  );

  const conversionWindowMs =
    conversionWindowDays * 24 * 60 * 60 * 1000;

  // Process each user independently
  for (const [, userEventList] of userEvents) {
    // Ensure events are chronological
    const sortedEvents = [...userEventList].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime()
    );

    let currentStepIndex = 0;
    let firstStepTime: Date | null = null;

    for (const event of sortedEvents) {
      // Find the first funnel step
      if (currentStepIndex === 0) {
        if (!matchesStep(event, steps[0]!)) {
          continue;
        }

        firstStepTime = event.createdAt;

        stepCounts[0]++;
        currentStepIndex = 1;

        if (currentStepIndex === steps.length) {
          break;
        }

        continue;
      }

      if (!firstStepTime) {
        break;
      }

      // Conversion window is measured from the first step
      const elapsedFromStart =
        event.createdAt.getTime() -
        firstStepTime.getTime();

      // Stop if conversion window has been exceeded
      if (elapsedFromStart > conversionWindowMs) {
        break;
      }

      // Match only the expected next funnel step
      if (matchesStep(event, steps[currentStepIndex]!)) {
        stepCounts[currentStepIndex]++;
        currentStepIndex++;

        if (currentStepIndex === steps.length) {
          break;
        }
      }
    }
  }

  // Calculate funnel metrics for every step
  const funnelResults: FunnelStepResult[] = steps.map(
    (step, index) => {
      const users = stepCounts[index] ?? 0;

      const previousUsers =
        index === 0
          ? users
          : stepCounts[index - 1] ?? 0;

      const conversionRate =
        index === 0 || previousUsers === 0
          ? index === 0 && users > 0
            ? 100
            : 0
          : (users / previousUsers) * 100;

      const dropOffUsers = Math.max(
        0,
        previousUsers - users
      );

      const dropOffRate =
        previousUsers === 0
          ? 0
          : (dropOffUsers / previousUsers) * 100;

      const overallConversionRate =
        stepCounts[0] === 0
          ? 0
          : (users / stepCounts[0]) * 100;

      return {
        stepNumber: index + 1,
        name: step.name,
        type: step.type,
        value: step.value,
        users,
        conversionRate: Number(
          conversionRate.toFixed(2)
        ),
        dropOffUsers,
        dropOffRate: Number(
          dropOffRate.toFixed(2)
        ),
        overallConversionRate: Number(
          overallConversionRate.toFixed(2)
        ),
      };
    }
  );

  const totalUsers = stepCounts[0] ?? 0;

  const convertedUsers =
    stepCounts[steps.length - 1] ?? 0;

  const overallConversionRate =
    totalUsers === 0
      ? 0
      : (convertedUsers / totalUsers) * 100;

  const overallDropOffRate =
    totalUsers === 0
      ? 0
      : 100 - overallConversionRate;

  return {
    steps: funnelResults,
    summary: {
      totalUsers,
      convertedUsers,
      overallConversionRate: Number(
        overallConversionRate.toFixed(2)
      ),
      overallDropOffRate: Number(
        overallDropOffRate.toFixed(2)
      ),
      conversionWindowDays,
    },
  };
}