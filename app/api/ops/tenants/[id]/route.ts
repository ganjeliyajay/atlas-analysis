import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prismaOps } from "@/lib/prisma-ops";
import { createAuditLog } from "@/lib/audit";
import { Prisma } from "@/lib/generated/prisma/client";
import { formatUtcNaiveTimestamp } from "@/lib/analytics/date-utils";
import { z } from "zod";

const updateTenantSchema = z.object({
  status: z.enum(["active", "suspended"]).optional(),
  eventQuota: z.number().int().min(1000).max(100_000_000).optional(),
  suspendedReason: z.string().max(500).nullable().optional(),
}).refine(
  (data) => data.status !== undefined || data.eventQuota !== undefined || data.suspendedReason !== undefined,
  { message: "At least one tenant field must be provided." },
).refine(
  (data) => data.status !== "active" || data.suspendedReason == null,
  { message: "A reactivated tenant cannot retain a suspension reason." },
);

export const PATCH = auth(async function PATCH(
  request,
  context?: { params?: Promise<{ id: string }> }
) {
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
        { error: "Forbidden: Superadmin access required" },
        { status: 403 }
      );
    }

    const params = await context?.params;
    const organizationId = params?.id;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing tenant organization ID" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateTenantSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { status, eventQuota, suspendedReason } = parsed.data;

    // Keep the tenant mutation and its audit record in one transaction. If
    // audit insertion fails, the status/quota change is rolled back as well.
    const transactionResult = await prismaOps.$transaction(async (tx) => {
      const existing = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, status: true, eventQuota: true },
      });

      if (!existing) return null;

      const updateData: Prisma.OrganizationUpdateInput = {};

      if (status !== undefined) {
        updateData.status = status;
        updateData.suspendedAt = status === "suspended" ? new Date() : null;
        if (status === "active") updateData.suspendedReason = null;
      }
      if (eventQuota !== undefined) updateData.eventQuota = eventQuota;
      if (suspendedReason !== undefined) updateData.suspendedReason = suspendedReason;

      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: updateData,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          eventQuota: true,
          suspendedAt: true,
          suspendedReason: true,
          updatedAt: true,
        },
      });

      await createAuditLog(tx, {
        actorId: session.user.id,
        action: status
          ? status === "suspended"
            ? "tenant.suspended"
            : "tenant.reactivated"
          : eventQuota !== undefined
            ? "tenant.quota_updated"
            : "tenant.suspension_reason_updated",
        targetType: "organization",
        targetId: organizationId,
        details: {
          previousStatus: existing.status,
          newStatus: updated.status,
          previousQuota: existing.eventQuota,
          newQuota: updated.eventQuota,
          suspendedReason: updated.suspendedReason,
        },
      });

      return updated;
    });

    if (!transactionResult) {
      return NextResponse.json(
        { error: "Tenant organization not found" },
        { status: 404 },
      );
    }

    const updated = transactionResult;

    return NextResponse.json({
      success: true,
      message: `Tenant ${updated.name} updated successfully`,
      tenant: {
        ...updated,
        suspendedAt: updated.suspendedAt ? formatUtcNaiveTimestamp(updated.suspendedAt) : null,
        updatedAt: formatUtcNaiveTimestamp(updated.updatedAt),
      },
    });
  } catch (error) {
    console.error("Ops tenant update error:", error);
    return NextResponse.json(
      { error: "Failed to update tenant organization" },
      { status: 500 }
    );
  }
});

