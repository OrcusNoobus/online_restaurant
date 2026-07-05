import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests need DATABASE_URL; test workers inherit this process's env.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env — fine, e.g. CI provides the environment directly
}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Integration suites share one dev database; admin tests mutate catalog
    // rows and settings that menu/orders tests observe (feat-007). Parallel
    // files made that racy — sequential is deterministic and still fast.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
