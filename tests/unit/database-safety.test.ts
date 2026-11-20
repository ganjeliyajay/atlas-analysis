import { describe, it, expect } from "vitest";
import { validateDatabaseUrl } from "@/tests/database-safety";
import fs from "fs";
import path from "path";

describe("Database Safety Boundary & Test Fixture Security Verification", () => {
  describe("Host & Protocol Security Rules", () => {
    it("allows loopback hosts (localhost, 127.0.0.1, ::1, [::1])", () => {
      expect(
        validateDatabaseUrl(
          "TEST_VAR",
          "postgresql://user:pass@localhost:5432/atlas_analytics_test"
        ).valid
      ).toBe(true);

      expect(
        validateDatabaseUrl(
          "TEST_VAR",
          "postgresql://user:pass@127.0.0.1:5432/atlas_analytics_test"
        ).valid
      ).toBe(true);

      expect(
        validateDatabaseUrl(
          "TEST_VAR",
          "postgresql://user:pass@[::1]:5432/atlas_analytics_test"
        ).valid
      ).toBe(true);
    });

    it("rejects remote cloud hosts with a fatal safety exception", () => {
      const remoteUrls = [
        "postgresql://prod_user:secret@prod-db.rds.amazonaws.com:5432/atlas_test",
        "postgresql://prod_user:secret@ep-cold-shadow.us-east-2.aws.neon.tech/atlas_test",
        "postgresql://prod_user:secret@db.supabase.co:5432/atlas_test",
        "postgresql://prod_user:secret@10.0.1.25:5432/atlas_test",
        "postgresql://prod_user:secret@192.168.1.50:5432/atlas_test",
        "postgresql://prod_user:secret@production.internal:5432/atlas_test",
      ];

      for (const remoteUrl of remoteUrls) {
        expect(() => validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", remoteUrl)).toThrow(
          /targets remote host/i
        );
      }
    });

    it("rejects non-postgres protocols", () => {
      expect(() =>
        validateDatabaseUrl("TEST_VAR", "mysql://localhost:3306/atlas_test")
      ).toThrow(/invalid protocol/i);

      expect(() =>
        validateDatabaseUrl("TEST_VAR", "http://localhost:5432/atlas_test")
      ).toThrow(/invalid protocol/i);
    });
  });

  describe("Database Name Safety Rules", () => {
    it("rejects production and default database names", () => {
      const unsafeUrls = [
        "postgresql://postgres@localhost:5432/atlas_analytics",
        "postgresql://postgres@localhost:5432/atlas_production",
        "postgresql://postgres@localhost:5432/postgres",
        "postgresql://postgres@localhost:5432/production",
        "postgresql://postgres@localhost:5432/app_live",
        "postgresql://postgres@localhost:5432/main",
        "postgresql://postgres@localhost:5432/master",
      ];

      for (const unsafeUrl of unsafeUrls) {
        expect(() => validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", unsafeUrl)).toThrow(
          /points to non-test database/i
        );
      }
    });

    it("accepts valid test database naming variants", () => {
      const validUrls = [
        "postgresql://postgres@localhost:5432/atlas_analytics_test",
        "postgresql://postgres@localhost:5432/test_atlas",
        "postgresql://postgres@localhost:5432/testing_db",
        "postgresql://postgres@localhost:5432/atlas-testing",
        "postgresql://postgres@localhost:5432/integration_test_2026",
      ];

      for (const validUrl of validUrls) {
        const res = validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", validUrl);
        expect(res.valid).toBe(true);
      }
    });
  });

  describe("Fail-Closed Validation on Missing Credentials", () => {
    it("rejects undefined, empty, or whitespace-only connection strings", () => {
      expect(() => validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", undefined)).toThrow(
        /is required but was empty/i
      );
      expect(() => validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", "")).toThrow(
        /is required but was empty/i
      );
      expect(() => validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", "   ")).toThrow(
        /is required but was empty/i
      );
    });

    it("rejects malformed URLs without valid database names", () => {
      expect(() => validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", "postgresql://localhost:5432/")).toThrow(
        /missing a target database name/i
      );
      expect(() => validateDatabaseUrl("DATABASE_URL_TEST_FIXTURES", "not-a-valid-url")).toThrow(
        /must be a valid PostgreSQL connection URL/i
      );
    });
  });

  describe("Architectural Shielding of Fixture Client", () => {
    it("proves zero imports of testFixturePrisma or test-client inside app/ and lib/", () => {
      function scanDir(dir: string, fileList: string[] = []) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            if (file !== "node_modules" && file !== ".next" && file !== "generated") {
              scanDir(filePath, fileList);
            }
          } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
            fileList.push(filePath);
          }
        }
        return fileList;
      }

      const root = process.cwd();
      const appFiles = scanDir(path.join(root, "app"));
      const libFiles = scanDir(path.join(root, "lib"));
      const productionFiles = [...appFiles, ...libFiles];

      expect(productionFiles.length).toBeGreaterThan(20);

      const illicitImports: { file: string; line: string }[] = [];

      for (const file of productionFiles) {
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");
        for (const line of lines) {
          if (
            line.includes("testFixturePrisma") ||
            line.includes("tests/test-client") ||
            line.includes("@/tests/test-client")
          ) {
            illicitImports.push({ file: path.relative(root, file), line: line.trim() });
          }
        }
      }

      expect(illicitImports).toEqual([]);
    });
  });
});
