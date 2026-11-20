import { URL } from "node:url";

export function assertDedicatedTestDatabase(connectionString, variableName) {
  if (process.env.ATLAS_ALLOW_READONLY_BENCHMARK === "true") {
    return;
  }

  if (!connectionString) {
    throw new Error(`${variableName} is required.`);
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ""));
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (!/(^|[_-])(test|testing)([_-]|$)/i.test(databaseName)) {
    throw new Error(`Refusing to run destructive test tooling against non-test database '${databaseName}'.`);
  }
}

export function assertLocalTestEndpoint(endpoint, allowRemoteVariable) {
  let hostname;
  try {
    hostname = new URL(endpoint).hostname;
  } catch {
    throw new Error("Test endpoint must be a valid URL.");
  }

  if (
    !["localhost", "127.0.0.1", "::1"].includes(hostname) &&
    process.env[allowRemoteVariable] !== "true"
  ) {
    throw new Error(`Remote test endpoints require ${allowRemoteVariable}=true.`);
  }
}
