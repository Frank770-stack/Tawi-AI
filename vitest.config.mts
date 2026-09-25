import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

// Tests run against TEST_DATABASE_URL, never DATABASE_URL. They wipe it.
const env = loadEnv("test", process.cwd(), "");
if (!env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL (see README)");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    env: { DATABASE_URL: env.TEST_DATABASE_URL, SMS_MODE: "console" },
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false, // tests share one database
    testTimeout: 30_000,
  },
});
