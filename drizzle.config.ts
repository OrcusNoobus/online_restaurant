import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dbCredentials: {
    // drizzle-kit loads .env itself; init.sh creates .env from .env.example
    url: process.env.DATABASE_URL!,
  },
});
