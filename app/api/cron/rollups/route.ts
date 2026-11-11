import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rebuildEventRollups } from "@/lib/analytics/rollups";

const bodySchema = z.object({}).strict();

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length &&
    timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await rebuildEventRollups();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Rollup job failed", error);
    return NextResponse.json({ error: "Rollup job failed" }, { status: 500 });
  }
}
