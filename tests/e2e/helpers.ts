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

/** Ambiente dos scripts que mexem nos dados: só o banco e2e e a pasta base e2e. */
const E2E_ENV = { ...process.env, DATABASE_URL: "file:./prisma/e2e.db", STUDYFLOW_BASE_DIR: E2E_BASE_DIR };

/**
 * Recria a pasta base e2e vazia, o usuário local e os 8 registros de exemplo no banco e2e.
 * Apagar a pasta é coisa do teste (dentro de os.tmpdir()); o app em si nunca apaga nada do disco.
 */
export function resetData() {
  fs.rmSync(E2E_BASE_DIR, { recursive: true, force: true });
  fs.mkdirSync(E2E_BASE_DIR, { recursive: true });
  execSync("npx tsx prisma/seed.ts", { stdio: "pipe", env: E2E_ENV });
}

/**
 * Insere um Estudo direto no banco e2e, sem a validação do app (para simular dados antigos, como
 * uma pasta relativa). Devolve o id criado.
 */
export function insertStudy(record: { descricao: string; pasta: string }): string {
  return execSync("npx tsx tests/e2e/insert-study.ts", {
    stdio: "pipe",
    // Pelo ambiente (e não pela linha de comando): acentos e aspas chegam intactos no Windows.
    env: { ...E2E_ENV, E2E_STUDY: JSON.stringify(record) },
  })
    .toString()
    .trim();
}

/** Linhas da tabela (visão desktop). */
export function tableRows(page: Page) {
  return page.locator("tbody tr");
}
