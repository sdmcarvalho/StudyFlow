import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

/**
 * Pasta base dos Estudos nos testes e2e (STUDYFLOW_BASE_DIR do servidor e do seed). Fica sempre
 * dentro da pasta temporária do sistema, nunca em C:\StudyFlow.
 */
export const E2E_BASE_DIR = path.join(os.tmpdir(), "studyflow-e2e");

/**
 * Pasta da Voz nos testes e2e (STUDYFLOW_VOZ_DIR do servidor; ver playwright.config.ts). Fica dentro da pasta
 * base e2e, fora da pasta dos Estudos do superusuário, e é apagada junto com ela em resetData. O e2e usa o
 * motor falso (STUDYFLOW_VOZ_ENGINE=fake): só o catálogo precisa de arquivos (ver installDummyVoice).
 */
export const E2E_VOZ_DIR = path.join(E2E_BASE_DIR, "voz-e2e");

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
  SEED_FORCE: "1", // o seed recusa apagar dados existentes; aqui o banco é descartável
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
  // O seed preserva AiSettings (e a Voz); os testes começam sem configuração de IA nem de Voz salva.
  execSync("npx tsx tests/e2e/clear-ai-settings.ts", { stdio: "pipe", env: E2E_ENV });
}

/**
 * Insere um Estudo direto no banco e2e, sem a validação do app (para simular dados antigos, como
 * uma pasta relativa). Devolve o id criado.
 */
export function insertStudy(record: { descricao: string; pasta: string; cells?: string[] }): string {
  return execSync("npx tsx tests/e2e/insert-study.ts", {
    stdio: "pipe",
    // Pelo ambiente (e não pela linha de comando): acentos e aspas chegam intactos no Windows.
    env: { ...E2E_ENV, E2E_STUDY: JSON.stringify(record) },
  })
    .toString()
    .trim();
}

/** Insere um card em um Estudo direto no banco e2e (sem o editor). Devolve o id criado. */
export function insertCard(studyId: string, card: { tema: string; pergunta: string; resposta: string }): string {
  return execSync("npx tsx tests/e2e/insert-card.ts", {
    stdio: "pipe",
    env: { ...E2E_ENV, E2E_CARD: JSON.stringify({ studyId, ...card }) },
  })
    .toString()
    .trim();
}

/**
 * Cria em E2E_VOZ_DIR/voices um par .onnx/.onnx.json de mentira para o catálogo oferecer (e aceitar) a voz.
 * O motor falso nunca lê esses arquivos.
 */
export function installDummyVoice(id = "pt_BR-faber-medium") {
  const voices = path.join(E2E_VOZ_DIR, "voices");
  fs.mkdirSync(voices, { recursive: true });
  fs.writeFileSync(path.join(voices, `${id}.onnx`), "x");
  fs.writeFileSync(path.join(voices, `${id}.onnx.json`), "{}");
}

/** Entra pela tela /login (padrão: o superusuário e2e) e espera sair dela. */
export async function login(page: Page, credentials: { email: string; password: string } = E2E_SUPER): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

/** Sai pelo menu "Sair" e espera chegar em /login. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
}

/** Cria um usuário comum pela tela Usuários (o superusuário já precisa estar logado). */
export async function createUserViaUi(
  page: Page,
  user: { nome: string; email: string; senha: string },
): Promise<void> {
  await page.goto("/usuarios");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo usuário" });
  await dialog.getByLabel("Nome").fill(user.nome);
  await dialog.getByLabel("E-mail").fill(user.email);
  await dialog.getByLabel("Senha").fill(user.senha);
  await dialog.getByRole("button", { name: "Criar" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("row", { name: new RegExp(user.email) })).toBeVisible();
}

/** Linhas da tabela (visão desktop). */
export function tableRows(page: Page) {
  return page.locator("tbody tr");
}
