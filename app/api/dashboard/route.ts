import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { getDashboardData } from "@/lib/analytics/dashboard-service";

const dashboardQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d", "90d", "custom"]).default("30d"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be in YYYY-MM-DD format")
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be in YYYY-MM-DD format")
    .optional(),
  projectId: z.string().max(100).optional(),
  eventName: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
});

export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;
    const authUserId = session?.user?.id;

    if (!authUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      rawQuery[key] = val;
    });

    const parsed = dashboardQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid dashboard query parameters" },
        { status: 400 }
      );
    }

    const { range, startDate, endDate, projectId, eventName, userId } = parsed.data;

    const result = await getDashboardData({
      authUserId,
      range,
      startDate,
      endDate,
      projectId,
      eventName,
      userId,
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard analytics" },
      { status: 500 }
    );
  }
});
