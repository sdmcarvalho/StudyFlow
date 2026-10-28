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

/** Superusuário dos testes e2e (criado por prisma/bootstrap.ts em resetData). */
export const E2E_SUPER = { email: "super@e2e.test", password: "Senha1234", name: "Admin" };

/** Pasta do superusuário: <E2E_BASE_DIR>\<folderName>, onde o seed cria os Estudos de exemplo. */
export const E2E_USER_ROOT = path.join(E2E_BASE_DIR, "Admin");

/** Ambiente dos scripts que mexem nos dados: só o banco e2e, a pasta base e2e e o superusuário e2e. */
const E2E_ENV = {
  ...process.env,
  DATABASE_URL: "file:./prisma/e2e.db",
  STUDYFLOW_BASE_DIR: E2E_BASE_DIR,
  SUPERUSER_EMAIL: E2E_SUPER.email,
  SUPERUSER_PASSWORD: E2E_SUPER.password,
  SUPERUSER_NAME: E2E_SUPER.name,
};

/**
 * Recria a pasta base e2e vazia, o superusuário e os 8 registros de exemplo dele no banco e2e (os
 * demais usuários e as sessões são apagados).
 * Apagar a pasta é coisa do teste (dentro de os.tmpdir()); o app em si nunca apaga nada do disco.
 */
export function resetData() {
  fs.rmSync(E2E_BASE_DIR, { recursive: true, force: true });
  fs.mkdirSync(E2E_BASE_DIR, { recursive: true });
  execSync("npx tsx tests/e2e/reset-users.ts", { stdio: "pipe", env: E2E_ENV });
  execSync("npx tsx prisma/bootstrap.ts", { stdio: "pipe", env: E2E_ENV });
  execSync("npx tsx prisma/seed.ts", { stdio: "pipe", env: E2E_ENV });
  // O seed preserva AiSettings; os testes começam sem configuração de IA salva.
  execSync("npx tsx tests/e2e/clear-ai-settings.ts", { stdio: "pipe", env: E2E_ENV });
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
