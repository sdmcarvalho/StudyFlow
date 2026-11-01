import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { MSG_FEW_CELLS } from "../../src/features/voz/range";
import { insertStudy, installDummyVoice, login, resetData } from "./helpers";

// O servidor do e2e usa o motor falso (STUDYFLOW_VOZ_ENGINE=fake, ver playwright.config.ts): o MP3 é de silêncio
// com a duração proporcional ao texto. O que se confere aqui é o fluxo, não o som.

const STUDY_NAME = "Estudo de Voz e2e";
// Cinco células; a 3 (só "---") não tem texto falável e é pulada na leitura.
const CELLS = [
  "Primeira célula sobre a fotossíntese.",
  "Segunda célula: a clorofila absorve a luz do sol.",
  "---",
  "Quarta célula com **negrito** e um [link](https://exemplo.com) no meio.",
  "Quinta e última célula do estudo.",
];

let studyId: string;

test.beforeEach(async ({ page }) => {
  resetData(); // apaga também a pasta de voz e2e (fica dentro da pasta base e2e)
  installDummyVoice(); // o catálogo precisa do par .onnx/.onnx.json; o motor falso nunca os lê
  studyId = insertStudy({ descricao: STUDY_NAME, pasta: "Estudo-Voz-e2e", cells: CELLS });
  await login(page);
});

const startField = (page: Page) => page.getByLabel("Célula inicial", { exact: true });
const endField = (page: Page) => page.getByLabel("Célula final", { exact: true });
const gravar = (page: Page) => page.getByRole("button", { name: "Gravar", exact: true });
const lerLink = (page: Page) => page.getByRole("link", { name: "Ler", exact: true });
const lerDisabled = (page: Page) => page.locator('[aria-disabled="true"]').filter({ hasText: /^Ler$/ });

/** Da grade do Estudo até a tela Voz do Estudo de teste (o clique no botão Voz não abre o editor). */
async function openVozFromGrid(page: Page) {
  await page.goto("/estudo");
  const row = page.getByRole("row", { name: new RegExp(STUDY_NAME) });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Voz do registro" }).click();
  await expect(page).toHaveURL(new RegExp(`/estudo/${studyId}/voz$`));
  await expect(page.getByRole("heading", { name: "Voz", level: 1 })).toBeVisible();
}

test("Estudo → Voz: campos, validação, Gravar e Baixar MP3", async ({ page }) => {
  await openVozFromGrid(page);
  // A linha não abriu o editor: seguimos em /voz.
  await expect(page).not.toHaveURL(new RegExp(`/estudo/${studyId}$`));

  // Título e campos: descrição e total somente leitura; padrão 1 e 5.
  await expect(page.getByRole("heading", { name: "Ler ou gravar", level: 2 })).toBeVisible();
  await expect(page.getByLabel("Descrição", { exact: true })).toHaveValue(STUDY_NAME);
  await expect(page.getByLabel("Células", { exact: true })).toHaveValue("5");
  await expect(startField(page)).toHaveValue("1");
  await expect(endField(page)).toHaveValue("5");
  await expect(lerLink(page)).toBeVisible();
  await expect(gravar(page)).toBeEnabled();

  // Inicial 5 (= N): erro junto ao campo e Ler/Gravar desabilitados.
  await startField(page).fill("5");
  await expect(page.getByRole("alert").filter({ hasText: "A célula inicial deve estar entre 1 e 4." })).toBeVisible();
  await expect(startField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(lerDisabled(page)).toBeVisible();
  await expect(lerLink(page)).toHaveCount(0);
  await expect(gravar(page)).toBeDisabled();

  // Inicial 2: o erro some, a final continua 5.
  await startField(page).fill("2");
  await expect(page.getByRole("alert").filter({ hasText: "A célula inicial" })).toHaveCount(0);
  await expect(endField(page)).toHaveValue("5");
  await expect(gravar(page)).toBeEnabled();

  // Gravar: acompanha até "Pronto" e baixa o MP3 com o nome certo.
  await gravar(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Pronto" })).toBeVisible({ timeout: 30_000 });
  const downloadLink = page.getByRole("link", { name: "Baixar MP3" });
  await expect(downloadLink).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  expect(download.suggestedFilename()).toBe(`${STUDY_NAME} - células 2 a 5.mp3`);
  const file = await download.path();
  const bytes = fs.readFileSync(file);
  expect(bytes.length).toBeGreaterThan(0);
  // MP3 começa com o cabeçalho ID3 ou com um quadro MPEG (sincronismo 0xFF).
  const startsWithId3 = bytes.subarray(0, 3).toString("latin1") === "ID3";
  expect(startsWithId3 || bytes[0] === 0xff).toBe(true);

  // Voltar ao Estudo leva ao editor do Estudo.
  await page.getByRole("link", { name: "Voltar ao Estudo" }).click();
  await expect(page).toHaveURL(new RegExp(`/estudo/${studyId}$`));
});

test("Ler: mostra as células do intervalo, pula a sem texto e move o destaque", async ({ page }) => {
  // O áudio não é verificável sem cabeça; o play() vira um no-op para o destaque não depender do fim da mídia.
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await openVozFromGrid(page);
  await startField(page).fill("2");
  await lerLink(page).click();
  await expect(page).toHaveURL(new RegExp(`/estudo/${studyId}/voz/ler\\?de=2&ate=5$`));
  await expect(page.getByRole("heading", { name: "Ler", level: 2 })).toBeVisible();

  // As 4 células do intervalo (2 a 5); a 3 é mostrada e marcada como sem texto.
  const items = page.getByRole("list", { name: `Células de ${STUDY_NAME}` }).getByRole("listitem");
  await expect(items).toHaveCount(4);
  // (?!\d), não \b: o texto da célula pode vir colado ao número ("Célula 3sem texto para ler").
  const cell = (n: number) => items.filter({ hasText: new RegExp(`Célula ${n}(?!\\d)`) });
  await expect(cell(3)).toContainText("sem texto para ler");
  await expect(cell(3).getByRole("button", { name: /Tocar a partir da célula/ })).toHaveCount(0);
  await expect(cell(2).getByRole("button", { name: "Tocar a partir da célula 2" })).toBeVisible();

  // Antes de tocar, a atual já é a primeira com texto (2).
  await expect(cell(2)).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Anterior" })).toBeDisabled();

  // Tocar cria a tarefa e a célula 2 vira a fonte do áudio.
  const audio = page.locator("audio").first();
  await page.getByRole("button", { name: "Tocar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
  await expect(audio).toHaveAttribute("src", /\/api\/voz\/jobs\/[^/]+\/cells\/2$/, { timeout: 30_000 });
  await expect(cell(2)).toHaveAttribute("aria-current", "true");

  // Próxima pula a 3 (sem texto) e destaca a 4.
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(cell(4)).toHaveAttribute("aria-current", "true");
  await expect(cell(2)).not.toHaveAttribute("aria-current", "true");
  await expect(cell(3)).not.toHaveAttribute("aria-current", "true");
  await expect(audio).toHaveAttribute("src", /\/cells\/4$/, { timeout: 30_000 });

  // Mais uma: chega à última (5) e Próxima desabilita; Anterior volta para a 4.
  await page.getByRole("button", { name: "Próxima" }).click();
  await expect(cell(5)).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Próxima" })).toBeDisabled();
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(cell(4)).toHaveAttribute("aria-current", "true");

  // "Tocar daqui" numa célula leva o destaque para ela.
  await cell(5).getByRole("button", { name: "Tocar a partir da célula 5" }).click();
  await expect(cell(5)).toHaveAttribute("aria-current", "true");
  await expect(audio).toHaveAttribute("src", /\/cells\/5$/, { timeout: 30_000 });

  // Voltar leva à tela Voz do mesmo Estudo.
  await page.getByRole("link", { name: "Voltar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/estudo/${studyId}/voz$`));
});

test("Configuração: a seção Voz salva a velocidade e o valor persiste", async ({ page }) => {
  await page.goto("/configuracao");
  const section = page.getByRole("region", { name: "Voz", exact: true });
  await expect(section).toBeVisible();
  await expect(section.getByLabel("Voz", { exact: true })).toContainText("faber (média)");
  await expect(section.getByLabel("Velocidade")).toHaveValue("1");

  await section.getByLabel("Velocidade").fill("1.5");
  await section.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuração salva." })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "Voz", exact: true }).getByLabel("Velocidade")).toHaveValue("1.5");
});

test("Estudo com 1 célula: aviso de células insuficientes e controles desabilitados", async ({ page }) => {
  const shortId = insertStudy({ descricao: "Estudo curto de Voz", pasta: "Estudo-Curto-Voz", cells: ["Só uma célula."] });
  await page.goto(`/estudo/${shortId}/voz`);

  await expect(page.getByText(MSG_FEW_CELLS)).toBeVisible();
  await expect(page.getByLabel("Células", { exact: true })).toHaveValue("1");
  await expect(startField(page)).toBeDisabled();
  await expect(endField(page)).toBeDisabled();
  await expect(lerDisabled(page)).toBeVisible();
  await expect(gravar(page)).toBeDisabled();

  await page.getByRole("link", { name: "Voltar ao Estudo" }).click();
  await expect(page).toHaveURL(new RegExp(`/estudo/${shortId}$`));
});
