
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL_OPS;

if (!connectionString) {
  throw new Error("DATABASE_URL_OPS is not set");
}

const adapter = new PrismaPg({
  connectionString,
});

const globalForOpsPrisma = globalThis as unknown as {
  opsPrisma: PrismaClient | undefined;
};

export const prismaOps =
  globalForOpsPrisma.opsPrisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForOpsPrisma.opsPrisma = prismaOps;
}

