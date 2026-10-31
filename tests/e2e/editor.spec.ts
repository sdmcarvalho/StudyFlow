import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { formatDateBR, toIsoDate } from "../../src/lib/dates";
import { E2E_USER_ROOT, insertStudy, login, resetData, tableRows } from "./helpers";

const PROGRAMACAO = "Programação — Estruturas de dados";
const PIXEL = path.join(__dirname, "fixtures", "pixel.png");
const PIXEL_NAME = /^pixel-\d{8}-\d{6}\.png$/;

test.beforeEach(async ({ page }) => {
  resetData();
  await login(page);
  await page.goto("/estudo");
});

/** Abre o Estudo clicando numa célula comum da linha (não no link da descrição). */
async function openStudy(page: Page, descricao = PROGRAMACAO) {
  await tableRows(page).filter({ hasText: descricao }).locator("td").nth(2).click();
  await expect(page).toHaveURL(/\/estudo\/[^/?#]+$/);
  await expect(page.getByRole("heading", { level: 1, name: descricao })).toBeVisible();
}

const cells = (page: Page) => page.getByRole("group", { name: /^Célula \d+ de \d+$/ });
const cell = (page: Page, n: number) => page.getByRole("group", { name: new RegExp(`^Célula ${n} de \\d+$`) });
const markdown = (page: Page, n: number) => page.getByLabel(`Markdown da célula ${n}`, { exact: true });
// A barra tem duas regiões role="status" (salvamento e "Resumindo…"); `data-save-status` marca a do salvamento.
const saveStatus = (page: Page) =>
  page.getByRole("toolbar", { name: "Barra de ferramentas" }).locator("[data-save-status]");
const toolbarButton = (page: Page, name: string) =>
  page.getByRole("toolbar", { name: "Barra de ferramentas" }).getByRole("button", { name, exact: true });

/** Entra na edição da célula vazia do documento novo. */
async function editEmptyCell(page: Page) {
  await page.getByText("Célula vazia. Clique para editar.").click();
  await expect(markdown(page, 1)).toBeFocused();
}

/** Escreve duas células ("um" e "dois") e sai da edição. */
async function writeTwoCells(page: Page, first = "um", second = "dois") {
  await editEmptyCell(page);
  await page.keyboard.type(first);
  await cell(page, 1).getByRole("button", { name: "Adicionar célula abaixo" }).click();
  await expect(markdown(page, 2)).toBeFocused();
  await page.keyboard.type(second);
  await page.keyboard.press("Escape");
  await expect(cells(page)).toHaveCount(2);
}

async function saveWithButton(page: Page) {
  await toolbarButton(page, "Salvar").click();
  await expect(saveStatus(page)).toHaveText(/^Salvo às \d{2}:\d{2}$/);
}

/** Pasta real do Estudo de Programação (seed: `<E2E_USER_ROOT>\Ciência da Computação`). */
const imagesDir = () => path.join(E2E_USER_ROOT, "Ciência da Computação", "imagens");

function savedImages(): string[] {
  try {
    return fs.readdirSync(imagesDir()).filter((name) => PIXEL_NAME.test(name));
  } catch {
    return [];
  }
}

/** Envia `pixel.png` pelo diálogo "Imagem" na célula 1 (que precisa estar em edição). */
async function insertPixel(page: Page) {
  await toolbarButton(page, "Imagem").click();
  const dialog = page.getByRole("dialog", { name: "Inserir imagem" });
  await dialog.getByRole("tab", { name: "Enviar do computador" }).click();
  await dialog.getByLabel("Arquivo de imagem").setInputFiles(PIXEL);
  await expect(dialog.getByLabel("Texto alternativo")).toHaveValue("pixel");
  await expect(dialog.getByText("Enviando…")).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Inserir" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(markdown(page, 1)).toHaveValue(/^!\[pixel\]\(imagens\/pixel-\d{8}-\d{6}\.png\)$/);
}

async function expectImageLoaded(page: Page) {
  const image = cell(page, 1).locator("img").first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
}

test("clicar numa linha abre o editor com o menu lateral e o título; ← Estudo volta à grade", async ({ page }) => {
  await expect(tableRows(page).first()).toContainText(PROGRAMACAO);
  await tableRows(page).first().locator("td").nth(2).click();

  await expect(page).toHaveURL(/\/estudo\/[^/?#]+$/);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Estudo" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: PROGRAMACAO })).toBeVisible();

  await page.getByRole("link", { name: "← Estudo" }).click();
  await expect(page).toHaveURL(/\/estudo$/);
  await expect(tableRows(page)).toHaveCount(5);
});

test("o + adiciona uma célula; # Título vira h1 ao sair da edição com Esc", async ({ page }) => {
  await openStudy(page);
  await expect(cells(page)).toHaveCount(1);

  await page.getByRole("button", { name: "Adicionar célula abaixo" }).click();
  await expect(cells(page)).toHaveCount(2);
  await expect(markdown(page, 2)).toBeFocused();
  await page.keyboard.type("# Título");
  await page.keyboard.press("Escape");

  await expect(markdown(page, 2)).toHaveCount(0);
  await expect(cell(page, 2).getByRole("heading", { level: 1, name: "Título" })).toBeVisible();
});

test("Negrito envolve a seleção em ** e Ctrl+Z desfaz a formatação", async ({ page }) => {
  await openStudy(page);
  await editEmptyCell(page);
  await page.keyboard.type("texto");
  await page.keyboard.press("ControlOrMeta+A");

  await toolbarButton(page, "Negrito").click();
  await expect(markdown(page, 1)).toHaveValue("**texto**");
  await expect(markdown(page, 1)).toBeFocused();

  await page.keyboard.press("ControlOrMeta+Z");
  await expect(markdown(page, 1)).toHaveValue("texto");
});

test("salvar pelo botão: recarregar mostra o mesmo conteúdo e ordem, e a Data atualização muda", async ({ page }) => {
  const fisica = "Física II — Eletromagnetismo";
  const row = tableRows(page).filter({ hasText: fisica });
  await expect(row.locator("td").nth(3)).toHaveText("14/10/2026");
  await openStudy(page, fisica);

  await writeTwoCells(page, "primeira", "segunda");
  await saveWithButton(page);
  await expect(page.getByRole("status").filter({ hasText: "Documento salvo." })).toBeVisible();

  await page.reload();
  await expect(cells(page)).toHaveCount(2);
  await expect(cell(page, 1)).toContainText("primeira");
  await expect(cell(page, 2)).toContainText("segunda");

  await page.getByRole("link", { name: "← Estudo" }).click();
  await expect(page).toHaveURL(/\/estudo$/);
  const today = formatDateBR(toIsoDate(new Date()));
  await expect(tableRows(page).first()).toContainText(fisica);
  await expect(tableRows(page).first().locator("td").nth(3)).toHaveText(today);
});

test("autosave: depois de digitar aparece Salvo às e o texto continua ao recarregar", async ({ page }) => {
  await openStudy(page);
  await editEmptyCell(page);
  await page.keyboard.type("salvo sozinho");
  await expect(saveStatus(page)).toHaveText("● Alterações não salvas");
  await expect(saveStatus(page)).toHaveText(/^Salvo às \d{2}:\d{2}$/, { timeout: 10_000 });

  await page.reload();
  await expect(cell(page, 1)).toContainText("salvo sozinho");
});

test("reordena pelo teclado (alça, Espaço, seta para baixo, Espaço) e a ordem fica depois de recarregar", async ({ page }) => {
  await openStudy(page);
  await writeTwoCells(page, "A primeira", "B segunda");

  const handle = cell(page, 1).getByRole("button", { name: "Arrastar célula" });
  await handle.focus();
  await page.keyboard.press("Space");
  // Como uma pessoa, cada tecla espera o retorno visual da anterior: a alça "pressionada" e a
  // célula 2 subindo para o lugar da 1. Soltar antes disso solta sobre a posição antiga (o
  // dnd-kit só atualiza o destino na renderização seguinte à seta).
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 2)).toHaveAttribute("style", /translate3d\(0px, -\d+(\.\d+)?px, 0px\)/);
  await page.keyboard.press("Space");

  await expect(cell(page, 1)).toContainText("B segunda");
  await expect(cell(page, 2)).toContainText("A primeira");

  await saveWithButton(page);
  await page.reload();
  await expect(cell(page, 1)).toContainText("B segunda");
  await expect(cell(page, 2)).toContainText("A primeira");
});

test("excluir uma célula e Desfazer; excluir a única célula deixa uma vazia", async ({ page }) => {
  await openStudy(page);
  await writeTwoCells(page);

  await cell(page, 2).getByRole("button", { name: "Excluir célula" }).click();
  await expect(cells(page)).toHaveCount(1);
  await expect(page.getByText("dois")).toHaveCount(0);
  const undo = page.getByRole("status").filter({ hasText: "Célula excluída." });
  await undo.getByRole("button", { name: "Desfazer" }).click();
  await expect(cells(page)).toHaveCount(2);
  await expect(cell(page, 2)).toContainText("dois");

  await cell(page, 2).getByRole("button", { name: "Excluir célula" }).click();
  await expect(cells(page)).toHaveCount(1);
  await cell(page, 1).getByRole("button", { name: "Excluir célula" }).click();
  await expect(cells(page)).toHaveCount(1);
  await expect(cell(page, 1).getByText("Célula vazia. Clique para editar.")).toBeVisible();
  await expect(page.getByText("um", { exact: true })).toHaveCount(0);
});

test("modos: Dividida mostra Markdown e resultado em todas; Preview esconde alças e +; clicar de novo volta", async ({ page }) => {
  await openStudy(page);
  await writeTwoCells(page, "**um**", "**dois**");
  const split = toolbarButton(page, "Visualização dividida");
  const preview = toolbarButton(page, "Visualização (preview)");

  await split.click();
  await expect(split).toHaveAttribute("aria-pressed", "true");
  await expect(markdown(page, 1)).toHaveValue("**um**");
  await expect(markdown(page, 2)).toHaveValue("**dois**");
  await expect(cell(page, 1).locator("strong")).toHaveText("um");
  await expect(cell(page, 2).locator("strong")).toHaveText("dois");

  await preview.click();
  await expect(preview).toHaveAttribute("aria-pressed", "true");
  await expect(split).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Arrastar célula" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adicionar célula abaixo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Excluir célula" })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(cell(page, 1).locator("strong")).toHaveText("um");

  await preview.click();
  await expect(preview).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Arrastar célula" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Adicionar célula abaixo" })).toHaveCount(2);
  await expect(markdown(page, 1)).toHaveCount(0);
  await expect(markdown(page, 2)).toHaveCount(0);
});

test("sair sem salvar: o link mostra o aviso e Continuar editando fica; depois de salvo, navega direto", async ({ page }) => {
  await openStudy(page);
  const editorUrl = page.url();
  const testes = page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Testes" });

  await editEmptyCell(page);
  await page.keyboard.type("pendente");
  await testes.click();
  const dialog = page.getByRole("alertdialog", { name: "Sair sem salvar?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Continuar editando" }).click();
  await expect(dialog).toHaveCount(0);
  expect(page.url()).toBe(editorUrl);
  await expect(cell(page, 1)).toContainText("pendente");

  await saveWithButton(page);
  await testes.click();
  await expect(page).toHaveURL(/\/testes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Testes" })).toBeVisible();
});

test("imagem: enviar pixel.png grava em <pasta>\\imagens, aparece no preview e continua ao recarregar", async ({ page }) => {
  await openStudy(page);
  expect(savedImages()).toEqual([]);
  await editEmptyCell(page);
  await insertPixel(page);

  const files = savedImages();
  expect(files).toHaveLength(1);
  expect(fs.statSync(path.join(imagesDir(), files[0])).size).toBe(fs.statSync(PIXEL).size);
  await expect(markdown(page, 1)).toHaveValue(`![pixel](imagens/${files[0]})`);

  await page.keyboard.press("Escape");
  await expectImageLoaded(page);

  await saveWithButton(page);
  await page.reload();
  await expectImageLoaded(page);
});

test("redimensionar: 200 no campo Largura grava |200 no Markdown e aplica a largura", async ({ page }) => {
  await openStudy(page);
  await editEmptyCell(page);
  await insertPixel(page);
  await page.keyboard.press("Escape");
  await expectImageLoaded(page);

  await cell(page, 1).getByRole("button", { name: "Imagem: pixel" }).click();
  const width = cell(page, 1).getByLabel("Largura");
  await width.fill("200");
  await width.press("Enter");

  const image = cell(page, 1).locator("img").first();
  await expect(image).toHaveAttribute("width", "200");
  await expect.poll(async () => (await image.boundingBox())?.width).toBe(200);

  await toolbarButton(page, "Visualização dividida").click();
  await expect(markdown(page, 1)).toHaveValue(/^!\[pixel\|200\]\(imagens\/pixel-\d{8}-\d{6}\.png\)$/);
});

test("LaTeX vira .katex e um bloco ```js recebe as classes hljs", async ({ page }) => {
  await openStudy(page);
  await editEmptyCell(page);
  await markdown(page, 1).fill("Fórmula: $x^2$");
  await cell(page, 1).getByRole("button", { name: "Adicionar célula abaixo" }).click();
  await markdown(page, 2).fill("```js\nconst total = 1;\n```");
  await page.keyboard.press("Escape");

  await expect(cell(page, 1).locator(".katex").first()).toBeVisible();
  const code = cell(page, 2).locator("pre code");
  await expect(code).toHaveClass(/\bhljs\b/);
  await expect(code.locator("[class^='hljs-']").first()).toBeVisible();
});

test("Estudo com pasta legada (relativa) abre com o aviso e salva texto normalmente", async ({ page }) => {
  const descricao = "Legado — pasta antiga";
  const id = insertStudy({ descricao, pasta: "Matemática" });
  await page.reload();
  await openStudy(page, descricao);
  await expect(page).toHaveURL(new RegExp(`/estudo/${id}$`));

  await expect(page.getByText("Defina uma pasta válida para usar imagens")).toBeVisible();
  await editEmptyCell(page);
  await expect(toolbarButton(page, "Imagem")).toBeDisabled();
  await page.keyboard.type("texto do legado");
  await saveWithButton(page);

  await page.reload();
  await expect(cell(page, 1)).toContainText("texto do legado");
  await expect(page.getByText("Defina uma pasta válida para usar imagens")).toBeVisible();
});

test("HTML hostil numa célula não dispara diálogo nem vira <img>", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await openStudy(page);
  await editEmptyCell(page);
  await markdown(page, 1).fill("<img src=x onerror=alert(1)>");
  await page.keyboard.press("Escape");
  await expect(markdown(page, 1)).toHaveCount(0);
  await expect(page.locator("[data-cell-id] img")).toHaveCount(0);

  await toolbarButton(page, "Visualização (preview)").click();
  await expect(page.locator("[data-cell-id] img")).toHaveCount(0);
  await toolbarButton(page, "Visualização (preview)").click();

  await saveWithButton(page);
  await page.reload();
  await expect(cells(page)).toHaveCount(1);
  await expect(page.locator("[data-cell-id] img")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(dialogs).toEqual([]);
});
