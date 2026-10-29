import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_USER_ROOT, login, resetData, tableRows } from "./helpers";

test.beforeEach(async ({ page }) => {
  resetData();
  await login(page);
  await page.goto("/estudo");
});

const toast = (page: Page) => page.getByRole("status");

async function createRecord(page: Page, descricao: string, pasta: string) {
  await page.getByRole("button", { name: "Novo" }).first().click();
  await page.getByLabel("Descrição").fill(descricao);
  await page.getByLabel("Pasta").fill(`${E2E_USER_ROOT}\\${pasta}`);
  await page.getByRole("button", { name: "Salvar" }).click();
}

async function deleteRow(page: Page, row = tableRows(page).first()) {
  await row.getByRole("button", { name: "Excluir registro" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await expect(toast(page)).toContainText("Registro excluído.");
}

test("a raiz redireciona para /estudo e a primeira página mostra 5 de 8 registros", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/estudo$/);
  await expect(tableRows(page)).toHaveCount(5);
  await expect(page.getByText("Mostrando 1–5 de 8 registros")).toBeVisible();
  await expect(tableRows(page).first()).toContainText("Programação — Estruturas de dados");
});

test("cria um registro: aparece no topo com o toast de confirmação", async ({ page }) => {
  await createRecord(page, "Estatística — Probabilidade", "Estatística");
  await expect(toast(page)).toContainText("Registro criado.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(tableRows(page).first()).toContainText("Estatística — Probabilidade");
  await expect(page.getByText("Mostrando 1–5 de 9 registros")).toBeVisible();
  expect(fs.statSync(path.join(E2E_USER_ROOT, "Estatística")).isDirectory()).toBe(true);
});

test("o modal de novo registro começa com a pasta base no campo Pasta", async ({ page }) => {
  await page.getByRole("button", { name: "Novo" }).first().click();
  await expect(page.getByLabel("Pasta")).toHaveValue(`${E2E_USER_ROOT}\\`);
});

test("Procurar… navega no disco, cria uma pasta e preenche o campo Pasta", async ({ page }) => {
  await page.getByRole("button", { name: "Novo" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo registro" });
  await dialog.getByLabel("Descrição").fill("Geografia — Climas");
  await dialog.getByRole("button", { name: "Procurar…" }).click();

  // Abre na pasta base e2e, que tem as pastas do seed.
  await expect(dialog.locator("output")).toHaveText(E2E_USER_ROOT);
  const list = dialog.getByRole("list", { name: "Subpastas" });
  await expect(list.getByRole("button", { name: "Matemática" })).toBeVisible();

  await dialog.getByRole("button", { name: "Nova pasta" }).click();
  await dialog.getByLabel("Nome da nova pasta").fill("Geografia");
  await dialog.getByRole("button", { name: "Criar" }).click();
  await expect(dialog.locator("output")).toHaveText(`${E2E_USER_ROOT}\\Geografia`);
  expect(fs.statSync(path.join(E2E_USER_ROOT, "Geografia")).isDirectory()).toBe(true);

  // Sobe um nível e volta a entrar pela lista.
  await dialog.getByRole("button", { name: "Pasta acima" }).click();
  await expect(dialog.locator("output")).toHaveText(E2E_USER_ROOT);
  await list.getByRole("button", { name: "Geografia" }).click();
  await expect(dialog.locator("output")).toHaveText(`${E2E_USER_ROOT}\\Geografia`);
  await dialog.getByRole("button", { name: "Selecionar esta pasta" }).click();

  await expect(dialog.getByLabel("Pasta")).toHaveValue(`${E2E_USER_ROOT}\\Geografia`);
  await expect(dialog.getByLabel("Descrição")).toHaveValue("Geografia — Climas");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(toast(page)).toContainText("Registro criado.");
  await expect(tableRows(page).first()).toContainText(`${E2E_USER_ROOT}\\Geografia`);
});

test("Esc no seletor de pastas volta ao formulário sem fechar o modal", async ({ page }) => {
  await page.getByRole("button", { name: "Novo" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo registro" });
  await dialog.getByRole("button", { name: "Procurar…" }).click();
  await expect(dialog.getByRole("list", { name: "Subpastas" }).getByRole("button", { name: "Matemática" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog.getByLabel("Pasta")).toHaveValue(`${E2E_USER_ROOT}\\`);
  await expect(dialog.getByRole("button", { name: "Procurar…" })).toBeFocused();
});

test("Pasta relativa mostra a mensagem de caminho absoluto no modal", async ({ page }) => {
  await page.getByRole("button", { name: "Novo" }).first().click();
  await page.getByLabel("Descrição").fill("Relativo");
  await page.getByLabel("Pasta").fill("Matemática");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByText("Informe um caminho absoluto, como C:\\Estudos\\Cálculo ou /var/estudos/calculo.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Pasta já usada por outro Estudo mostra a mensagem de duplicidade no modal", async ({ page }) => {
  await createRecord(page, "Outra Matemática", "matemática\\");
  await expect(page.getByText("Já existe um Estudo usando esta pasta.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("edita a descrição: o registro vai para o topo com o toast de atualização", async ({ page }) => {
  const row = tableRows(page).filter({ hasText: "Anatomia — Sistema nervoso" });
  await row.getByRole("button", { name: "Editar registro" }).click();
  await expect(page.getByRole("dialog", { name: "Editar registro" })).toBeVisible();
  await page.getByLabel("Descrição").fill("Anatomia — Sistema cardiovascular");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(toast(page)).toContainText("Registro atualizado.");
  await expect(tableRows(page).first()).toContainText("Anatomia — Sistema cardiovascular");
  await expect(page.getByText("Anatomia — Sistema nervoso")).toHaveCount(0);
});

test("modal com campos vazios mostra as três mensagens e não fecha", async ({ page }) => {
  await page.getByRole("button", { name: "Novo" }).first().click();
  await page.getByLabel("Pasta").fill(""); // começa com a pasta base
  await page.getByLabel("Data inicial").fill("");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByText("Informe uma descrição.")).toBeVisible();
  await expect(page.getByText("Informe uma pasta.")).toBeVisible();
  await expect(page.getByText("Informe uma data válida.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("excluir e desfazer devolve o registro à mesma posição", async ({ page }) => {
  const names = await tableRows(page).allInnerTexts();
  expect(names[2]).toContain("Física II — Eletromagnetismo");

  await deleteRow(page, tableRows(page).nth(2));
  await expect(page.getByText("Física II — Eletromagnetismo")).toHaveCount(0);

  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect(tableRows(page).nth(2)).toContainText("Física II — Eletromagnetismo");
  await expect(tableRows(page)).toHaveCount(5);
});

test("excluir sem desfazer: o registro não volta ao recarregar", async ({ page }) => {
  await deleteRow(page, tableRows(page).nth(2));
  await page.reload();
  await expect(page.getByText("Física II — Eletromagnetismo")).toHaveCount(0);
  await expect(page.getByText("Mostrando 1–5 de 7 registros")).toBeVisible();
});

test("busca sem acento, limpa pelo campo e pelo estado vazio, e mantém a busca na URL", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Pesquisar registros de estudo" });

  await search.fill("calculo");
  await expect(page).toHaveURL(/[?&]q=calculo/);
  await expect(page.getByText("1 resultado para “calculo”")).toBeVisible();
  await expect(tableRows(page)).toHaveCount(1);

  await page.getByRole("button", { name: "Limpar pesquisa" }).click();
  await expect(page).toHaveURL(/\/estudo$/);
  await expect(tableRows(page)).toHaveCount(5);

  await search.fill("zzzz");
  await expect(page.getByRole("heading", { name: "Nenhum resultado encontrado" })).toBeVisible();
  await page.locator("section").getByRole("button", { name: "Limpar pesquisa" }).click();
  await expect(tableRows(page)).toHaveCount(5);
  await expect(search).toHaveValue("");
});

test("pagina para a segunda página e volta", async ({ page }) => {
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(page.getByText("Mostrando 6–8 de 8 registros")).toBeVisible();
  await expect(tableRows(page)).toHaveCount(3);

  await page.getByRole("button", { name: "Página anterior" }).click();
  await expect(page.getByText("Mostrando 1–5 de 8 registros")).toBeVisible();
});

test("page=999 e page=abc carregam sem erro (última e primeira página)", async ({ page }) => {
  await page.goto("/estudo?page=999");
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  await expect(tableRows(page)).toHaveCount(3);

  await page.goto("/estudo?page=abc");
  await expect(page.getByText("Página 1 de 2")).toBeVisible();
  await expect(tableRows(page)).toHaveCount(5);
});

test("HTML na descrição aparece como texto e nenhum diálogo é disparado", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  const html = "<img src=x onerror=alert(1)>";
  await createRecord(page, html, "Teste");
  await expect(tableRows(page).first()).toContainText(html);
  await expect(page.locator("tbody img")).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test("excluir o único item da última página leva a tela para a página 1", async ({ page }) => {
  await page.goto("/estudo?page=2");
  await expect(tableRows(page)).toHaveCount(3);

  await deleteRow(page);
  await deleteRow(page);
  await expect(tableRows(page)).toHaveCount(1);
  await deleteRow(page);

  await expect(page.getByText("Mostrando 1–5 de 5 registros")).toBeVisible();
  await expect(tableRows(page)).toHaveCount(5);
});
