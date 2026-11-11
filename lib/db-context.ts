
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

type Transaction = Prisma.TransactionClient;

export async function withUserContext<T>(
  userId: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!userId.trim()) {
    throw new Error("User context is required");
  }

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
  if (!userId.trim() || !organizationId.trim()) {
    throw new Error("User and organization context are required");
  }

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

export async function withIngestionTenantContext<T>(
  organizationId: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!organizationId.trim()) {
    throw new Error("Ingestion tenant context is required");
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT set_config('app.tenant_id', ${organizationId}, true)
      `;

      return callback(tx);
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}
