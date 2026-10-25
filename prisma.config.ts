import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Com fallback, o `prisma generate` do postinstall funciona antes de existir um .env.
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
