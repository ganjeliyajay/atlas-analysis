
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

type Transaction = Prisma.TransactionClient;

export async function withUserContext<T>(
  userId: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.user_id', ${userId}, true)
    `;

    return callback(tx);
  });
}

export async function withTenantContext<T>(
  userId: string,
  organizationId: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.user_id', ${userId}, true)
    `;

    const membership = await tx.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new Error("Organization access denied");
    }

    await tx.$queryRaw`
      SELECT set_config('app.tenant_id', ${organizationId}, true)
    `;

    return callback(tx);
  });
}

/**
 * Context for public event ingestion.
 *
 * Authentication is performed through the project's API key
 * before calling this helper.
 *
 * This helper establishes tenant context without requiring
 * a signed-in dashboard user.
 */
export async function withIngestionTenantContext<T>(
  organizationId: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.tenant_id', ${organizationId}, true)
    `;

    return callback(tx);
  });
}
