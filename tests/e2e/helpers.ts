import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";

/**
 * Pasta base dos Estudos nos testes e2e (STUDYFLOW_BASE_DIR do servidor e do seed). Fica sempre
 * dentro da pasta temporária do sistema, nunca em C:\StudyFlow.
 */
export const E2E_BASE_DIR = path.join(os.tmpdir(), "studyflow-e2e");

/**
 * Recria a pasta base e2e vazia, o usuário local e os 8 registros de exemplo no banco e2e.
 * Apagar a pasta é coisa do teste (dentro de os.tmpdir()); o app em si nunca apaga nada do disco.
 */
export function resetData() {
  fs.rmSync(E2E_BASE_DIR, { recursive: true, force: true });
  fs.mkdirSync(E2E_BASE_DIR, { recursive: true });
  execSync("npx tsx prisma/seed.ts", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./prisma/e2e.db", STUDYFLOW_BASE_DIR: E2E_BASE_DIR },
  });
}

/** Linhas da tabela (visão desktop). */
export function tableRows(page: Page) {
  return page.locator("tbody tr");
}
