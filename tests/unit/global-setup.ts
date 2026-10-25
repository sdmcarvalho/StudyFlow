import { execSync } from "node:child_process";

/** Aplica as migrations no banco de teste (prisma/test.db) uma vez por execução. */
export default function setup() {
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
  });
}
