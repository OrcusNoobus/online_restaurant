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
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
