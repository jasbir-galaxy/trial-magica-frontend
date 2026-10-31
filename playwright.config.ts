import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Test-only configuration never enters the Next.js browser bundle. Explicit
// process settings take precedence; no production-instance Clerk keys are allowed.
for (const file of [".env.e2e.local", ".env.local"]) {
  if (existsSync(file)) for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) process.env[key] ??= value;
}
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const target = new URL(baseURL);
if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new Error("Use a valid test application URL.");
if (!["localhost", "127.0.0.1"].includes(target.hostname) && process.env.E2E_ALLOW_HOSTED !== "1") throw new Error("Set E2E_ALLOW_HOSTED=1 to explicitly test a hosted application.");

export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, retries: 0,
  timeout: 240_000, expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]], outputDir: "test-results",
  // Authenticated traces contain bearer tokens. Keep traces off; reports and
  // screenshots are ignored local artifacts and must be reviewed before sharing.
  use: { baseURL, trace: "off", screenshot: "only-on-failure", actionTimeout: 20_000, navigationTimeout: 30_000 },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"], storageState: ".auth/user.json" }, dependencies: ["setup"], testMatch: /.*\.spec\.ts/ },
  ],
});
