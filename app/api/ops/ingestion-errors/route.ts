
import { auth } from "@/auth";
import { prismaOps } from "@/lib/prisma-ops";
import { NextResponse } from "next/server";

export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "").trim();

    const page = Math.max(
      1,
      Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20
      )
    );

    const statusCodeParam = url.searchParams.get("statusCode");
    const statusCode = statusCodeParam
      ? Number.parseInt(statusCodeParam, 10)
      : undefined;

    const errorCode =
      url.searchParams.get("errorCode")?.trim() || undefined;

    const where = {
      ...(Number.isInteger(statusCode) ? { statusCode } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(search
        ? {
            OR: [
              {
                errorCode: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                endpoint: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                method: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              ...(Number.isInteger(Number(search))
                ? [{ statusCode: Number(search) }]
                : []),
            ],
          }
        : {}),
    };

    const since24Hours = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    );

    const [
      total,
      recentErrors,
      totalLast24Hours,
      statusCounts,
      errorCodeCounts,
    ] = await Promise.all([
      prismaOps.ingestionErrorLog.count({
        where,
      }),

      prismaOps.ingestionErrorLog.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          projectId: true,
          errorCode: true,
          statusCode: true,
          method: true,
          endpoint: true,
          createdAt: true,
        },
      }),

      prismaOps.ingestionErrorLog.count({
        where: {
          createdAt: {
            gte: since24Hours,
          },
        },
      }),

      prismaOps.ingestionErrorLog.groupBy({
        by: ["statusCode"],
        _count: {
          _all: true,
        },
        where: {
          createdAt: {
            gte: since24Hours,
          },
        },
      }),

      prismaOps.ingestionErrorLog.groupBy({
        by: ["errorCode"],
        _count: {
          _all: true,
        },
        where: {
          createdAt: {
            gte: since24Hours,
          },
        },
        orderBy: {
          _count: {
            errorCode: "desc",
          },
        },
        take: 10,
      }),
    ]);

    const projectIds = Array.from(
      new Set(
        recentErrors
          .map((error) => error.projectId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const projects = projectIds.length
      ? await prismaOps.project.findMany({
          where: {
            id: {
              in: projectIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const projectNames = new Map(
      projects.map((project) => [
        project.id,
        project.name,
      ])
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),

      metrics: {
        totalErrors: total,
        errorsLast24Hours: totalLast24Hours,

        statusCodeCounts: statusCounts.map((item) => ({
          statusCode: item.statusCode,
          count: item._count._all,
        })),

        topErrorCodes: errorCodeCounts.map((item) => ({
          errorCode: item.errorCode,
          count: item._count._all,
        })),
      },

      errors: recentErrors.map((error) => ({
        ...error,
        projectName: error.projectId
          ? projectNames.get(error.projectId) ?? null
          : null,
      })),

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(
          1,
          Math.ceil(total / limit)
        ),
      },
    });
  } catch (error) {
    console.error(
      "Ops ingestion error logs API error:",
      error
    );

    return NextResponse.json(
      { error: "Could not load ingestion error logs" },
      { status: 500 }
    );
  }
});
