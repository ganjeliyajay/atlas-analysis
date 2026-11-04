
import { NextResponse, connection } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  await connection();

  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const pingOnly = searchParams.get("ping") === "true";

    // Check database connectivity
    await prisma.$connect();

    // Check that the database can execute a query
    await prisma.$queryRaw`SELECT 1`;

    const responseTime = Date.now() - startTime;

    // Avoid unnecessary counting for ping requests
    const userCount = pingOnly ? null : await prisma.user.count();

    return NextResponse.json({
      status: "healthy",
      services: {
        api: {
          status: "operational",
          responseTime: `${responseTime}ms`,
        },
        database: {
          status: "connected",
        },
      },
      ...(pingOnly ? {} : { metrics: { userCount } }),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      (error as { digest?: string }).digest ===
        "NEXT_PRERENDER_INTERRUPTED"
    ) {
      throw error;
    }

    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        status: "unhealthy",
        services: {
          api: {
            status: "operational",
          },
          database: {
            status: "disconnected",
          },
        },
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
