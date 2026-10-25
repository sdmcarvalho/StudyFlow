import { execSync } from "node:child_process";
import type { Page } from "@playwright/test";

/** Recria o usuário local e os 8 registros de exemplo no banco e2e. */
export function resetData() {
  execSync("npx tsx prisma/seed.ts", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./prisma/e2e.db" },
  });
}

/** Linhas da tabela (visão desktop). */
export function tableRows(page: Page) {
  return page.locator("tbody tr");
}
