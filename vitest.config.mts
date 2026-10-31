import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Playwright requires a browser and live services; Vitest cannot run that suite.
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
