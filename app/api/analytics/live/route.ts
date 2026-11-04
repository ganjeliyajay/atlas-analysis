
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  withTenantContext,
  withUserContext,
} from "@/lib/db-context";

const POLL_INTERVAL = 3000;
const INITIAL_LIMIT = 40;
const POLL_LIMIT = 100;

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
    occurredAt: event.createdAt.toISOString(),
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

    const membership = await withUserContext(userId, async (tx) => {
      return tx.organizationMember.findFirst({
        where: { userId },
        select: { organizationId: true },
        orderBy: { createdAt: "asc" },
      });
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);

    const requestedLimit = Number.parseInt(
      searchParams.get("limit") || String(INITIAL_LIMIT),
      10,
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : INITIAL_LIMIT;

    const projectId = searchParams.get("projectId");

    const isSse =
      request.headers.get("accept")?.includes("text/event-stream") ||
      searchParams.get("stream") === "true";

    const organizationId = membership.organizationId;

    const fetchEvents = async (
      take: number,
      createdAtGte?: Date,
    ) => {
      return withTenantContext(
        userId,
        organizationId,
        async (tx) => {
          if (projectId && projectId !== "All") {
            const projectExists = await tx.project.findFirst({
              where: {
                id: projectId,
                organizationId,
              },
              select: { id: true },
            });

            if (!projectExists) {
              throw new Error("PROJECT_NOT_FOUND");
            }
          }

          return tx.analyticsEvent.findMany({
            where: {
              project: {
                organizationId,
              },
              ...(projectId && projectId !== "All"
                ? { projectId }
                : {}),
              ...(createdAtGte
                ? {
                    createdAt: {
                      gte: createdAtGte,
                    },
                  }
                : {}),
            },
            orderBy: [
              { createdAt: "desc" },
              { id: "desc" },
            ],
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
              project: {
                select: {
                  name: true,
                },
              },
            },
          });
        },
      );
    };

    let events: Awaited<ReturnType<typeof fetchEvents>>;

    try {
      events = await fetchEvents(limit);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "PROJECT_NOT_FOUND"
      ) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 },
        );
      }

      throw error;
    }

    const mappedEvents = events.map((event) =>
      mapEvent(event as LiveEventRecord),
    );

    if (!isSse) {
      return NextResponse.json({
        success: true,
        data: {
          events: mappedEvents,
        },
      });
    }

    const encoder = new TextEncoder();

    let isClosed = false;
    let isPolling = false;

    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const seenEventIds = new Set<string>(
      mappedEvents.map((event) => event.id),
    );

    let lastSeenDate =
      events.length > 0
        ? events[0].createdAt
        : new Date();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (payload: unknown) => {
          if (isClosed) return;

          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify(payload)}\n\n`,
              ),
            );
          } catch {
            closeStream();
          }
        };

        const sendHeartbeat = () => {
          if (isClosed) return;

          try {
            controller.enqueue(
              encoder.encode(": keepalive\n\n"),
            );
          } catch {
            closeStream();
          }
        };

        const closeStream = () => {
          if (isClosed) return;

          isClosed = true;

          if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = undefined;
          }

          try {
            controller.close();
          } catch {
            // Stream may already be closed.
          }
        };

        send({
          success: true,
          data: {
            events: mappedEvents,
          },
        });

        const pollForEvents = async () => {
          if (isClosed || isPolling) return;

          isPolling = true;

          try {
            const newEvents = await fetchEvents(
              POLL_LIMIT,
              lastSeenDate,
            );

            if (isClosed) return;

            const unseenEvents = newEvents.filter((event) => {
              const id = String(event.id);

              if (seenEventIds.has(id)) {
                return false;
              }

              seenEventIds.add(id);
              return true;
            });

            for (const event of newEvents) {
              if (event.createdAt > lastSeenDate) {
                lastSeenDate = event.createdAt;
              }
            }

            if (unseenEvents.length > 0) {
              send({
                success: true,
                data: {
                  events: unseenEvents.map((event) =>
                    mapEvent(event as LiveEventRecord),
                  ),
                },
              });
            } else {
              sendHeartbeat();
            }

            if (seenEventIds.size > 10000) {
              const latestIds = new Set(
                newEvents.map((event) => String(event.id)),
              );

              seenEventIds.clear();

              latestIds.forEach((id) => {
                seenEventIds.add(id);
              });
            }
          } catch (error) {
            console.error("Live SSE polling error:", error);
            sendHeartbeat();
          } finally {
            isPolling = false;

            if (!isClosed) {
              pollTimer = setTimeout(
                pollForEvents,
                POLL_INTERVAL,
              );
            }
          }
        };

        pollTimer = setTimeout(
          pollForEvents,
          POLL_INTERVAL,
        );

        request.signal.addEventListener(
          "abort",
          closeStream,
          { once: true },
        );

        if (request.signal.aborted) {
          closeStream();
        }
      },

      cancel() {
        isClosed = true;

        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = undefined;
        }
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
