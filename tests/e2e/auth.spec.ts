import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_BASE_DIR, E2E_SUPER, createUserViaUi, login, logout, resetData, tableRows } from "./helpers";

// Usuário comum dos testes; a pasta dele é <E2E_BASE_DIR>\<nome sem acentos>.
const MARIA = { nome: "Maria Teste", email: "maria@e2e.test", senha: "Senha5678" };
const MARIA_ROOT = path.join(E2E_BASE_DIR, "Maria Teste");

test.beforeEach(() => resetData());

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Navegação principal" });

/** O superusuário cria a Maria pela tela Usuários e sai; a página fica em /login. */
async function createMariaAndLogout(page: Page) {
  await login(page);
  await createUserViaUi(page, { nome: MARIA.nome, email: MARIA.email, senha: MARIA.senha });
  await logout(page);
}

test("sem sessão, /estudo redireciona para /login?next e volta para /estudo depois de entrar", async ({ page }) => {
  await page.goto("/estudo");
  await expect(page).toHaveURL(/\/login\?next=%2Festudo$/);
  await expect(page.getByRole("heading", { name: "Entrar", level: 1 })).toBeVisible();

  await page.getByLabel("E-mail").fill(E2E_SUPER.email);
  await page.getByLabel("Senha").fill(E2E_SUPER.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/estudo$/);
  await expect(tableRows(page)).toHaveCount(5);
});

test("senha errada mostra a mensagem e continua em /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_SUPER.email);
  await page.getByLabel("Senha").fill("SenhaErrada99");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("Sair volta para /login e /estudo volta a exigir login", async ({ page }) => {
  await login(page);
  await page.goto("/estudo");
  await expect(mainNav(page)).toBeVisible();

  await logout(page);
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/estudo");
  await expect(page).toHaveURL(/\/login\?next=%2Festudo$/);
});

test("o superusuário vê Usuários logo abaixo de Configuração e abre a tela", async ({ page }) => {
  await login(page);
  await page.goto("/estudo");

  const links = mainNav(page).getByRole("link");
  await expect(links).toHaveCount(5);
  await expect(links.nth(3)).toContainText("Configuração");
  await expect(links.nth(4)).toContainText("Usuários");

  await links.nth(4).click();
  await expect(page).toHaveURL(/\/usuarios$/);
  await expect(page.getByRole("heading", { name: "Usuários", level: 1 })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(E2E_SUPER.email) })).toContainText("Superusuário");
});

test("o superusuário cria um usuário; ele entra sem ver Usuários, recebe 404 em /usuarios e começa sem Estudos", async ({
  page,
}) => {
  await createMariaAndLogout(page);

  await login(page, { email: MARIA.email, password: MARIA.senha });
  await page.goto("/estudo");
  await expect(mainNav(page).getByRole("link")).toHaveCount(4);
  await expect(mainNav(page).getByRole("link", { name: "Usuários" })).toHaveCount(0);

  await page.goto("/usuarios");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usuários", level: 1 })).toHaveCount(0);

  // Os 8 Estudos de exemplo são do superusuário: a lista da Maria começa vazia.
  await page.goto("/estudo");
  await expect(page.getByRole("heading", { name: "Nenhum registro de estudo ainda" })).toBeVisible();
  await expect(tableRows(page)).toHaveCount(0);
  await expect(page.getByText("Programação — Estruturas de dados")).toHaveCount(0);
});

test("o usuário comum cria um Estudo na própria raiz e o superusuário não o vê", async ({ page }) => {
  await createMariaAndLogout(page);

  await login(page, { email: MARIA.email, password: MARIA.senha });
  await page.goto("/estudo");
  await page.getByRole("button", { name: "Novo" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo registro" });
  await expect(dialog.getByLabel("Pasta")).toHaveValue(`${MARIA_ROOT}\\`);
  await dialog.getByLabel("Descrição").fill("Biologia — Células");
  await dialog.getByLabel("Pasta").fill(`${MARIA_ROOT}\\Biologia`);
  await dialog.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Registro criado." })).toBeVisible();
  await expect(tableRows(page)).toHaveCount(1);
  await expect(tableRows(page).first()).toContainText("Biologia — Células");
  expect(fs.statSync(path.join(MARIA_ROOT, "Biologia")).isDirectory()).toBe(true);

  await logout(page);
  await login(page);
  await page.goto("/estudo");
  await expect(page.getByText("Mostrando 1–5 de 8 registros")).toBeVisible();
  await expect(page.getByText("Biologia — Células")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Pesquisar registros de estudo" }).fill("Biologia");
  await expect(page.getByRole("heading", { name: "Nenhum resultado encontrado" })).toBeVisible();
});

test("Pasta fora da raiz do usuário mostra o erro no campo e não cria a pasta", async ({ page }) => {
  await createMariaAndLogout(page);

  await login(page, { email: MARIA.email, password: MARIA.senha });
  await page.goto("/estudo");
  await page.getByRole("button", { name: "Novo" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo registro" });
  await dialog.getByLabel("Descrição").fill("Fora da raiz");
  // A pasta do superusuário é vizinha da raiz da Maria: fora dela.
  await dialog.getByLabel("Pasta").fill(`${E2E_BASE_DIR}\\Admin\\Intruso`);
  await dialog.getByRole("button", { name: "Salvar" }).click();

  await expect(dialog.getByText(`A pasta precisa ficar dentro de ${MARIA_ROOT}.`)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(fs.existsSync(path.join(E2E_BASE_DIR, "Admin", "Intruso"))).toBe(false);
});

test("o superusuário desativa o usuário e a próxima navegação dele cai em /login", async ({ page, browser, baseURL }) => {
  await createMariaAndLogout(page);

  // A Maria fica logada num segundo contexto (cookies próprios) enquanto o superusuário a desativa.
  const mariaContext = await browser.newContext({ baseURL });
  try {
    const mariaPage = await mariaContext.newPage();
    await login(mariaPage, { email: MARIA.email, password: MARIA.senha });
    await mariaPage.goto("/estudo");
    await expect(mainNav(mariaPage)).toBeVisible();

    await login(page);
    await page.goto("/usuarios");
    await page.getByRole("button", { name: `Desativar ${MARIA.nome}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "Usuário desativado." })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(MARIA.email) })).toContainText("Desativado");

    await mainNav(mariaPage).getByRole("link", { name: "Testes" }).click();
    await expect(mariaPage).toHaveURL(/\/login(\?|$)/);
    // O cookie ainda existe, mas a sessão não vale mais: o layout manda para /login (sem ?next, que é do proxy).
    await mariaPage.goto("/estudo");
    await expect(mariaPage).toHaveURL(/\/login(\?|$)/);
    await expect(mariaPage.getByRole("heading", { name: "Entrar", level: 1 })).toBeVisible();
  } finally {
    await mariaContext.close();
  }
});
