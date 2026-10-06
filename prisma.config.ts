import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Migrations need a direct connection; the app itself uses the pooled DATABASE_URL (Neon's "-pooler" host).

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
