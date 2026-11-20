import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });
dotenv.config();

export default defineConfig({
  test: {
    setupFiles: ["./tests/database-safety.ts"],
    environment: "node",
    globals: true,
    testTimeout: 30000,
    exclude: ["e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./") },
      { find: /^next\/server$/, replacement: path.resolve(__dirname, "./node_modules/next/server.js") },
    ],
  },
});

