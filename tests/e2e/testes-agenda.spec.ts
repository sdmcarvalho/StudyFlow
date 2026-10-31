import { expect, test, type Page } from "@playwright/test";
import { formatDateBR, todayIso } from "../../src/lib/dates";
import { insertCard, insertStudy, login, resetData, tableRows } from "./helpers";

const STUDY_NAME = "Estudo de Testes e2e";
const SESSIONS = ["Imediata", "24 horas", "3 dias", "1 semana", "1 mês", "6 meses"];

let studyId: string;

test.beforeEach(async ({ page }) => {
  resetData();
  studyId = insertStudy({ descricao: STUDY_NAME, pasta: "Estudo-Testes-e2e" });
  insertCard(studyId, { tema: "Capitais", pergunta: "Qual é a capital da França?", resposta: "Paris" });
  insertCard(studyId, { tema: "Capitais", pergunta: "Qual é a capital da Itália?", resposta: "Roma" });
  await login(page);
});

function nav(page: Page, label: string) {
  return page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: label });
}

function studyRow(page: Page) {
  return page.getByRole("row", { name: new RegExp(STUDY_NAME) });
}

/** Responde os 2 cards do teste aberto (ordem embaralhada) e chega à tela "Teste Concluído". */
async function answerAllCards(page: Page, results: [boolean, boolean]) {
  const answer = (correct: boolean) => page.getByRole("button", { name: correct ? "Acertei" : "Errei", exact: true });

  await page.getByRole("button", { name: "Ver resposta" }).click();
  await answer(results[0]).click();
  await page.getByRole("button", { name: "Próximo" }).click();
  await page.getByRole("button", { name: "Ver resposta" }).click();
  await answer(results[1]).click();
  await page.getByRole("button", { name: "Finalizar" }).click();
  await expect(page.getByRole("heading", { name: "Teste Concluído" })).toBeVisible();
}

/** Fecha a tela de conclusão (o botão "Fechar" do rodapé; o "×" tem o mesmo nome acessível). */
async function closeTest(page: Page) {
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Teste Concluído" })).toHaveCount(0);
}

test("teste, agendamento das revisões e conclusão pela Agenda", async ({ page }) => {
  // Testes: o Estudo aparece com 2 cards e ainda sem teste feito.
  await nav(page, "Testes").click();
  await expect(page).toHaveURL(/\/testes$/);
  const row = studyRow(page);
  await expect(row).toBeVisible();
  await expect(row.getByRole("cell").nth(4)).toHaveText("2");
  await expect(row.getByRole("cell").nth(2)).toHaveText("—");
  await expect(row.getByRole("cell").nth(3)).toHaveText("—");

  // Primeiro teste: 1 acerto e 1 erro.
  await row.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.getByText("Card 1 de 2")).toBeVisible();
  await answerAllCards(page, [true, false]);
  await expect(page.getByText("Você acertou 1 de 2 cards.")).toBeVisible();

  // Agendar revisões: a prévia lista as 6 sessões e confirmar cria os agendamentos.
  await page.getByRole("button", { name: "Agendar revisões" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirmar Agendamentos" });
  await expect(confirm).toBeVisible();
  await expect(confirm.locator("tbody tr")).toHaveCount(6);
  for (const session of SESSIONS) {
    await expect(confirm.getByRole("cell", { name: session, exact: true })).toBeVisible();
  }
  await confirm.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText("Agendamentos criados.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Agendar revisões" })).toBeDisabled();

  // Fechar o teste atualiza "Último teste" e "% de acertos" (1 de 2 = 50%).
  await closeTest(page);
  await expect(row.getByRole("cell").nth(2)).toHaveText(formatDateBR(todayIso()));
  await expect(row.getByRole("cell").nth(3)).toHaveText("50.00%");

  // Agenda: 6 linhas "Ativo", a primeira é a revisão Imediata.
  await nav(page, "Agenda").click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(tableRows(page)).toHaveCount(6);
  await expect(page.locator("tbody tr td:nth-child(5)").filter({ hasText: /^Ativo$/ })).toHaveCount(6);
  await expect(tableRows(page).first()).toContainText("Imediata");
  await expect(tableRows(page).first()).toContainText(STUDY_NAME);

  // "Fazer" leva ao Teste do Estudo, com a linha destacada.
  await tableRows(page).first().getByRole("link", { name: /^Fazer teste de/ }).click();
  await expect(page).toHaveURL(new RegExp(`/testes\\?study=${studyId}&schedule=[^&]+$`));
  await expect(studyRow(page)).toHaveAttribute("data-highlighted", "true");

  // Segundo teste (2 acertos) conclui a revisão Imediata.
  await studyRow(page).getByRole("button", { name: "Todos", exact: true }).click();
  await answerAllCards(page, [true, true]);
  await expect(page.getByText("Você acertou 2 de 2 cards.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "não foi possível registrar" })).toHaveCount(0);
  await closeTest(page);
  // Acumulado: 3 acertos em 4 tentativas.
  await expect(studyRow(page).getByRole("cell").nth(3)).toHaveText("75.00%");

  // De volta à Agenda: a Imediata está "Realizada" e as outras 5 seguem "Ativo".
  await nav(page, "Agenda").click();
  await expect(tableRows(page)).toHaveCount(6);
  await expect(tableRows(page).first()).toContainText("Imediata");
  await expect(tableRows(page).first().getByText("Realizado", { exact: true })).toBeVisible();
  await expect(tableRows(page).first().getByRole("link", { name: /^Fazer teste de/ })).toHaveCount(0);
  await expect(page.locator("tbody tr td:nth-child(5)").filter({ hasText: /^Ativo$/ })).toHaveCount(5);
  await expect(page.getByRole("link", { name: /^Fazer teste de/ })).toHaveCount(5);

  // Excluir: cancelar não apaga; confirmar apaga só a linha escolhida (a Imediata, já Realizada).
  const excluir = page.getByRole("button", { name: `Excluir agendamento de ${STUDY_NAME}` });
  await expect(excluir).toHaveCount(6);
  await excluir.first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(tableRows(page)).toHaveCount(6);

  await excluir.first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(tableRows(page)).toHaveCount(5);
  await expect(page.locator("tbody tr td:nth-child(5)").filter({ hasText: /^Ativo$/ })).toHaveCount(5);
  await expect(page.getByText("Realizado", { exact: true })).toHaveCount(0);
});
