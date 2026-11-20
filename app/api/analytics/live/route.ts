
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveOrganizationForUser } from "@/lib/organization";
import { formatUtcNaiveTimestamp } from "@/lib/analytics/date-utils";
import { withTenantContext } from "@/lib/db-context";
import { z } from "zod";
import { eventHub, LiveEventPayload } from "@/lib/analytics/event-hub";

const liveQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
  projectId: z.string().max(100).optional().nullable(),
  stream: z.enum(["true", "false"]).optional(),
});

type LiveEventRecord = {
  id: string;
  eventName: string;
  userId: string | null;
  sessionId: string | null;
  properties: unknown;
  pageUrl: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  createdAt: Date;
  projectId: string;
  project: {
    name: string;
  } | null;
};

function mapEvent(event: LiveEventRecord) {
  return {
    id: String(event.id),
    eventName: event.eventName,
    externalUserId: event.userId,
    occurredAt: formatUtcNaiveTimestamp(event.createdAt),
    properties: event.properties,
    sessionId: event.sessionId,
    pageUrl: event.pageUrl,
    country: event.country,
    device: event.device,
    browser: event.browser,
    projectId: event.projectId,
    projectName: event.project?.name ?? "Unknown Project",
  };
}

export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const membership = await getActiveOrganizationForUser(userId);

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      rawQuery[key] = val;
    });

    const parsedQuery = liveQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: parsedQuery.error.issues[0]?.message || "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { limit, projectId } = parsedQuery.data;

    const isSse =
      request.headers.get("accept")?.includes("text/event-stream") ||
      searchParams.get("stream") === "true";

    const organizationId = membership.organizationId;

    // Validate the project before opening an SSE response so a bad project
    // returns a real 404 rather than an error event inside HTTP 200.
    if (projectId && projectId !== "All") {
      const projectExists = await withTenantContext(
        userId,
        organizationId,
        (tx) => tx.project.findFirst({
          where: { id: projectId, organizationId },
          select: { id: true },
        }),
      );
      if (!projectExists) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 },
        );
      }
    }

    const fetchEvents = async (take: number, afterId?: string | null) => {
      return withTenantContext(
        userId,
        organizationId,
        async (tx) => {
          const baseWhere = {
            project: { organizationId },
            ...(projectId && projectId !== "All" ? { projectId } : {}),
          };

          if (afterId) {
            const cursor = await tx.analyticsEvent.findFirst({
              where: { id: afterId, ...baseWhere },
              select: { id: true, createdAt: true },
            });

            if (cursor) {
              const replayEvents = await tx.analyticsEvent.findMany({
                where: {
                  ...baseWhere,
                  OR: [
                    { createdAt: { gt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                  ],
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: 1000,
                select: {
                  id: true,
                  eventName: true,
                  userId: true,
                  sessionId: true,
                  properties: true,
                  pageUrl: true,
                  country: true,
                  device: true,
                  browser: true,
                  createdAt: true,
                  projectId: true,
                  project: { select: { name: true } },
                },
              });
              return { events: replayEvents, replayed: true };
            }
          }

          const recentEvents = await tx.analyticsEvent.findMany({
            where: baseWhere,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take,
            select: {
              id: true,
              eventName: true,
              userId: true,
              sessionId: true,
              properties: true,
              pageUrl: true,
              country: true,
              device: true,
              browser: true,
              createdAt: true,
              projectId: true,
              project: { select: { name: true } },
            },
          });
          return { events: recentEvents, replayed: false };
        },
      );
    };

    if (!isSse) {
      const result = await fetchEvents(limit);
      return NextResponse.json({
        success: true,
        data: { events: result.events.map((event) => mapEvent(event as LiveEventRecord)) },
      });
    }

    const encoder = new TextEncoder();
    const rawLastEventId = request.headers.get("last-event-id");
    const lastEventId = rawLastEventId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawLastEventId)
      ? rawLastEventId
      : null;

    let closeStreamRef: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let isClosed = false;
        let isBootstrapping = true;
        const cleanup = {
          heartbeatTimer: undefined as ReturnType<typeof setInterval> | undefined,
          unsubscribeHub: undefined as (() => void) | undefined,
        };
        const pendingLiveEvents: LiveEventPayload[] = [];

        const send = (payload: unknown, id?: string) => {
          if (isClosed) return;
          try {
            const idPart = id ? `id: ${id}\n` : "";
            controller.enqueue(encoder.encode(`${idPart}data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            closeStream();
          }
        };

        const sendHeartbeat = () => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            closeStream();
          }
        };

        const closeStream = () => {
          if (isClosed) return;
          isClosed = true;
          if (cleanup.heartbeatTimer) clearInterval(cleanup.heartbeatTimer);
          if (cleanup.unsubscribeHub) cleanup.unsubscribeHub();
          request.signal.removeEventListener("abort", closeStream);
          try {
            controller.close();
          } catch {
            // Stream may already be closed.
          }
        };
        closeStreamRef = closeStream;

        // Subscribe before reading history. Events published while the DB query
        // is in flight are buffered and de-duplicated against the history result.
        const subscription = eventHub.subscribe(organizationId, (liveEvent) => {
          if (isClosed) return;
          if (projectId && projectId !== "All" && liveEvent.projectId !== projectId) return;
          if (isBootstrapping) {
            pendingLiveEvents.push(liveEvent);
            return;
          }
          send({ success: true, data: { events: [liveEvent] } }, liveEvent.id);
        });

        if (!subscription.ok) {
          send({ error: subscription.reason || "Connection limit exceeded" });
          closeStream();
          return;
        }
        cleanup.unsubscribeHub = subscription.unsubscribe;
        request.signal.addEventListener("abort", closeStream, { once: true });
        if (request.signal.aborted) {
          closeStream();
          return;
        }

        // Send retry directive (3s) to instructs standard SSE clients on reconnection interval
        controller.enqueue(encoder.encode("retry: 3000\n\n"));
        cleanup.heartbeatTimer = setInterval(sendHeartbeat, 15000);

        try {
          const history = await fetchEvents(limit, lastEventId);
          if (isClosed) return;

          const mappedHistory = history.events.map((event) => mapEvent(event as LiveEventRecord));
          const historicalIds = new Set(history.events.map((event) => event.id));

          if (history.replayed) {
            for (const event of mappedHistory) {
              send({ success: true, data: { events: [event] } }, event.id);
            }
            if (history.events.length === 1000) {
              // Close after one bounded replay page. EventSource reconnects
              // with the last event ID and the next request continues paging.
              isBootstrapping = false;
              closeStream();
              return;
            }
          } else {
            // Initial history is newest-first; its first item is the latest
            // cursor that the browser should send on reconnect.
            send(
              { success: true, data: { events: mappedHistory } },
              history.events[0]?.id,
            );
          }

          isBootstrapping = false;
          const uniquePending = new Map<string, LiveEventPayload>();
          for (const event of pendingLiveEvents) {
            if (!historicalIds.has(event.id)) uniquePending.set(event.id, event);
          }
          const pendingInOrder = [...uniquePending.values()].sort((left, right) =>
            left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
          );
          for (const event of pendingInOrder) {
            send({ success: true, data: { events: [event] } }, event.id);
          }
        } catch (error) {
          send({ error: "Unable to load live event history" });
          closeStream();
          console.error("Live SSE bootstrap error:", error);
        }
      },
      cancel() {
        closeStreamRef?.();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Live Analytics API Error:", error);

    return NextResponse.json(
      { error: "Failed to fetch live analytics events" },
      { status: 500 },
    );
  }
});
