import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations need a direct connection; the app itself uses the pooled DATABASE_URL (Neon's "-pooler" host).
// Read without env() so `prisma generate` (run by npm install, which needs no database) works when neither is set;
// commands that do need one (migrate, seed) fail with Prisma's own "no datasource url" error.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
