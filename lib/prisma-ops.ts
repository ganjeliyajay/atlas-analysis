import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForOpsPrisma = globalThis as unknown as {
  opsPrisma?: PrismaClient;
};

let opsPrismaInstance: PrismaClient | null = null;

export function getOpsPrismaClient(): PrismaClient {
  if (opsPrismaInstance) {
    return opsPrismaInstance;
  }

  if (globalForOpsPrisma.opsPrisma) {
    opsPrismaInstance = globalForOpsPrisma.opsPrisma;
    return opsPrismaInstance;
  }

  // Strict OPS credential isolation: MUST only use DATABASE_URL_OPS.
  // Never fallback to DATABASE_URL_MIGRATION or generic DATABASE_URL.
  const connectionString = process.env.DATABASE_URL_OPS?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_OPS is required. Configure the dedicated least-privilege atlas_ops database role.",
    );
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  opsPrismaInstance = new PrismaClient({
    adapter,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForOpsPrisma.opsPrisma = opsPrismaInstance;
  }

  return opsPrismaInstance;
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

export const prismaOps = new Proxy(
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

      const client = getOpsPrismaClient();
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
      const client = getOpsPrismaClient();
      return Reflect.has(client, prop);
    },
    getPrototypeOf() {
      return PrismaClient.prototype;
    },
    getOwnPropertyDescriptor(target, prop) {
      void target;
      if (ignoredMetaProperties.has(prop)) {
        return undefined;
      }
      const client = getOpsPrismaClient();
      return Reflect.getOwnPropertyDescriptor(client, prop);
    },
    ownKeys() {
      const client = getOpsPrismaClient();
      return Reflect.ownKeys(client);
    },
  },
);
