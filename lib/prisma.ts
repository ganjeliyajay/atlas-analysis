import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let appPrismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (appPrismaInstance) {
    return appPrismaInstance;
  }

  if (globalForPrisma.prisma) {
    appPrismaInstance = globalForPrisma.prisma;
    return appPrismaInstance;
  }

  // Strict APP credential isolation: MUST only use DATABASE_URL_APP.
  // Never fallback to generic DATABASE_URL or other roles.
  const connectionString = process.env.DATABASE_URL_APP?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_APP is required. Configure the dedicated least-privilege atlas_app database role.",
    );
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  appPrismaInstance = new PrismaClient({
    adapter,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = appPrismaInstance;
  }

  return appPrismaInstance;
}

const ignoredMetaProperties = new Set<string | symbol>([
  "then",
  "__esModule",
  "$$typeof",
  "default",
  "toJSON",
  "constructor",
  Symbol.toStringTag,
  Symbol.toPrimitive,
]);

export const prisma = new Proxy(
  Object.create(PrismaClient.prototype) as PrismaClient,
  {
    get(target, prop) {
      void target;
      if (prop === "then") {
        return undefined;
      }
      if (prop === Symbol.toStringTag) {
        return "PrismaClient";
      }
      if (ignoredMetaProperties.has(prop)) {
        return undefined;
      }

      const client = getPrismaClient();
      const value = Reflect.get(client, prop, client);

      if (typeof value === "function") {
        return value.bind(client);
      }

      return value;
    },
    has(target, prop) {
      void target;
      if (ignoredMetaProperties.has(prop)) {
        return false;
      }
      const client = getPrismaClient();
      return Reflect.has(client, prop);
    },
    getPrototypeOf() {
      return PrismaClient.prototype;
    },
    getOwnPropertyDescriptor(target, prop) {
      if (ignoredMetaProperties.has(prop)) {
        return undefined;
      }
      const client = getPrismaClient();
      return Reflect.getOwnPropertyDescriptor(client, prop);
    },
    ownKeys() {
      const client = getPrismaClient();
      return Reflect.ownKeys(client);
    },
  },
);
