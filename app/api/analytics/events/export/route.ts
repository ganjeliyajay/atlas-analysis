
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  withTenantContext,
  withUserContext,
} from "@/lib/db-context";
import { z } from "zod";

const querySchema = z.object({
  projectId: z.string().trim().optional(),
  range: z.enum(["today", "7d", "30d", "90d"]).default("7d"),
  search: z.string().trim().max(200).optional(),
  eventName: z.string().trim().max(200).optional(),
  userId: z.string().trim().max(200).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function parseDate(value: string): Date | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

  const date = dateOnly
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseEndDateExclusive(value: string): Date | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

  const date = dateOnly
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (dateOnly) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function escapeCsv(value: unknown): string {
  let text = "";

  if (value === null || value === undefined) {
    text = "";
  } else if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === "object") {
    text = JSON.stringify(value) ?? "";
  } else {
    text = String(value);
  }

  // Prevent spreadsheet formula injection.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;
    const userIdFromSession = session?.user?.id;

    if (!userIdFromSession) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const membership = await withUserContext(
      userIdFromSession,
      async (tx) => {
        return tx.organizationMember.findFirst({
          where: {
            userId: userIdFromSession,
          },
          select: {
            organizationId: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });
      },
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);

    const parsed = querySchema.safeParse({
      projectId: searchParams.get("projectId") || undefined,
      range: searchParams.get("range") || "7d",
      search: searchParams.get("search") || undefined,
      eventName: searchParams.get("eventName") || undefined,
      userId: searchParams.get("userId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const {
      projectId,
      range,
      search,
      eventName,
      userId: filterUserId,
      startDate,
      endDate,
    } = parsed.data;

    const now = new Date();
    const rangeStart = new Date(now);

    switch (range) {
      case "today":
        rangeStart.setHours(0, 0, 0, 0);
        break;

      case "30d":
        rangeStart.setDate(now.getDate() - 30);
        break;

      case "90d":
        rangeStart.setDate(now.getDate() - 90);
        break;

      case "7d":
      default:
        rangeStart.setDate(now.getDate() - 7);
        break;
    }

    const parsedStartDate = startDate
      ? parseDate(startDate)
      : rangeStart;

    const parsedEndDateExclusive = endDate
      ? parseEndDateExclusive(endDate)
      : new Date(now.getTime() + 1);

    if (
      !parsedStartDate ||
      !parsedEndDateExclusive ||
      parsedStartDate >= parsedEndDateExclusive
    ) {
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 },
      );
    }

    return await withTenantContext(
      userIdFromSession,
      membership.organizationId,
      async (tx) => {
        if (projectId && projectId !== "All") {
          const projectExists = await tx.project.findFirst({
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
              { status: 404 },
            );
          }
        }

        const where = {
          project: {
            organizationId: membership.organizationId,
          },
          createdAt: {
            gte: parsedStartDate,
            lt: parsedEndDateExclusive,
          },
          ...(projectId && projectId !== "All"
            ? { projectId }
            : {}),
          ...(eventName
            ? {
                eventName: {
                  equals: eventName,
                  mode: "insensitive" as const,
                },
              }
            : {}),
          ...(filterUserId
            ? {
                userId: {
                  contains: filterUserId,
                  mode: "insensitive" as const,
                },
              }
            : {}),
          ...(search
            ? {
                OR: [
                  {
                    eventName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    userId: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    id: {
                      equals: search,
                    },
                  },
                ],
              }
            : {}),
        };

        const events = await tx.analyticsEvent.findMany({
          where,
          orderBy: {
            createdAt: "desc",
          },
          take: 50000,
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
          },
        });

        const csvHeaders = [
          "Event ID",
          "Event Name",
          "User ID",
          "Session ID",
          "Properties",
          "Page URL",
          "Country",
          "Device",
          "Browser",
          "Created At",
          "Project ID",
        ];

        const rows = events.map((event) =>
          [
            event.id,
            event.eventName,
            event.userId,
            event.sessionId,
            event.properties,
            event.pageUrl,
            event.country,
            event.device,
            event.browser,
            event.createdAt,
            event.projectId,
          ]
            .map(escapeCsv)
            .join(","),
        );

        const csv = [
          csvHeaders.map(escapeCsv).join(","),
          ...rows,
        ].join("\r\n");

        const filename = `atlas-events-${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;

        return new Response("\uFEFF" + csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    );
  } catch (error) {
    console.error("CSV Export API Error:", error);

    return NextResponse.json(
      { error: "Failed to export analytics events" },
      { status: 500 },
    );
  }
});
