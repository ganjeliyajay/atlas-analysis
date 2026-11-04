
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 1. Find the user's organization.
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
      },
      select: {
        organizationId: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 2. Read and validate query parameters.
    const { searchParams } = new URL(request.url);

    const requestedLimit = Number.parseInt(
      searchParams.get("limit") || String(INITIAL_LIMIT),
      10
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : INITIAL_LIMIT;

    const projectId = searchParams.get("projectId");

    // 3. Validate selected project.
    if (projectId && projectId !== "All") {
      const projectExists = await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: membership.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!projectExists) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 }
        );
      }
    }

    const isSse =
      request.headers.get("accept")?.includes("text/event-stream") ||
      searchParams.get("stream") === "true";

    // Shared organization and project filter.
    const eventWhere = {
      project: {
        organizationId: membership.organizationId,
      },
      ...(projectId && projectId !== "All"
        ? { projectId }
        : {}),
    };

    // 4. Fetch initial events.
    const events = await prisma.analyticsEvent.findMany({
      where: eventWhere,
      orderBy: {
        createdAt: "desc",
      },
      take: isSse ? limit : limit,
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

    const mappedEvents = events.map((event) =>
      mapEvent(event as LiveEventRecord)
    );

    // 5. Return JSON when SSE is not requested.
    if (!isSse) {
      return NextResponse.json({
        success: true,
        data: {
          events: mappedEvents,
        },
      });
    }

    // 6. Create Server-Sent Events stream.
    const encoder = new TextEncoder();

    let isClosed = false;
    let isPolling = false;

    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    // Keep track of already delivered event IDs.
    const seenEventIds = new Set<string>(
      mappedEvents.map((event) => event.id)
    );

    // Initial cursor: latest event timestamp.
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
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
            );
          } catch {
            closeStream();
          }
        };

        const sendHeartbeat = () => {
          if (isClosed) return;

          try {
            controller.enqueue(
              encoder.encode(": keepalive\n\n")
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

        // Send initial events immediately.
        send({
          success: true,
          data: {
            events: mappedEvents,
          },
        });

        // Poll for newly inserted events.
        const pollForEvents = async () => {
          if (isClosed || isPolling) return;

          isPolling = true;

          try {
            const newEvents = await prisma.analyticsEvent.findMany({
              where: {
                ...eventWhere,

                // Include the latest timestamp again to avoid
                // missing events created at the same timestamp.
                createdAt: {
                  gte: lastSeenDate,
                },
              },
              orderBy: [
                {
                  createdAt: "desc",
                },
                {
                  id: "desc",
                },
              ],
              take: POLL_LIMIT,
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

            if (isClosed) return;

            const unseenEvents = newEvents.filter((event) => {
              const id = String(event.id);

              if (seenEventIds.has(id)) {
                return false;
              }

              seenEventIds.add(id);
              return true;
            });

            // Advance timestamp cursor.
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
                    mapEvent(event as LiveEventRecord)
                  ),
                },
              });
            } else {
              sendHeartbeat();
            }

            // Prevent unbounded memory growth.
            if (seenEventIds.size > 10000) {
              const latestIds = new Set(
                newEvents.map((event) => String(event.id))
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
                POLL_INTERVAL
              );
            }
          }
        };

        // Start polling after the initial payload.
        pollTimer = setTimeout(
          pollForEvents,
          POLL_INTERVAL
        );

        // Stop the stream when the client disconnects.
        request.signal.addEventListener(
          "abort",
          closeStream,
          { once: true }
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
      { status: 500 }
    );
  }
});
