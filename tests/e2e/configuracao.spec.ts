import http from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { resetData } from "./helpers";

const GATEWAY_PORT = 3299;
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}/v1`;
const OTHER_URL = "http://127.0.0.1:3298/v1";
const FAKE_KEY = "chave-falsa-123";

/** Gateway falso (compatível com OpenAI) só na máquina local: o e2e nunca usa chave real nem a rede externa. */
let gateway: http.Server;

test.beforeAll(async () => {
  gateway = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/v1/models") {
      send(200, { data: [{ id: "modelo-b" }, { id: "modelo-a" }] });
    } else if (req.method === "POST" && req.url === "/v1/chat/completions") {
      req.resume();
      if (req.headers.authorization !== `Bearer ${FAKE_KEY}`) {
        send(401, { error: { message: "chave inválida" } });
      } else {
        send(200, { choices: [{ message: { content: "OK" } }] });
      }
    } else {
      send(404, { error: { message: "não encontrado" } });
    }
  });
  await new Promise<void>((resolve, reject) => {
    gateway.once("error", reject);
    gateway.listen(GATEWAY_PORT, "127.0.0.1", () => resolve());
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => gateway.close(() => resolve()));
});

test.beforeEach(() => resetData());

const fieldUrl = (page: Page) => page.getByLabel("Gateway base URL");
const fieldKey = (page: Page) => page.getByLabel("Gateway API key");
const fieldModel = (page: Page) => page.getByLabel("Modelo");
const testButton = (page: Page) => page.getByRole("button", { name: "Testar", exact: true });
const saveButton = (page: Page) => page.getByRole("button", { name: "Salvar", exact: true });
const result = (page: Page) => page.locator("form p[role=status]");

test("configura o gateway: busca modelos, testa, salva e a chave nunca volta ao navegador", async ({ page }) => {
  await page.goto("/estudo");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("link", { name: "Configuração" }).click();
  await expect(page).toHaveURL(/\/configuracao$/);
  await expect(page.getByRole("heading", { name: "Configuração", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Configuração" })).toHaveAttribute("aria-current", "page");

  await fieldUrl(page).fill(GATEWAY_URL);
  await fieldKey(page).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Buscar modelos" }).click();
  await expect(page.locator("#ai-models-list option")).toHaveCount(2);
  await expect(page.locator("#ai-models-list option").first()).toHaveAttribute("value", "modelo-a"); // lista ordenada
  await fieldModel(page).fill("modelo-a");

  await testButton(page).click();
  await expect(result(page)).toContainText("OK ·");
  await expect(result(page)).toContainText("resposta: OK");

  await fieldKey(page).fill("errada");
  await testButton(page).click();
  await expect(result(page)).toContainText("Falha · HTTP 401");

  // Salva com a chave certa; depois, em branco, a chave guardada é mantida.
  await fieldKey(page).fill(FAKE_KEY);
  await saveButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuração salva." })).toBeVisible();
  await expect(fieldKey(page)).toHaveValue("");
  await saveButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuração salva." })).toBeVisible();

  await page.reload();
  await expect(fieldUrl(page)).toHaveValue(GATEWAY_URL);
  await expect(fieldModel(page)).toHaveValue("modelo-a");
  await expect(fieldKey(page)).toHaveValue("");
  await expect(fieldKey(page)).toHaveAttribute("placeholder", "chav…-123");
  expect(await page.locator("body").innerText()).not.toContain(FAKE_KEY);
  expect(await page.content()).not.toContain(FAKE_KEY);

  // Com a chave em branco, o Testar usa a chave salva.
  await testButton(page).click();
  await expect(result(page)).toContainText("OK ·");
  await expect(result(page)).toContainText("resposta: OK");
  expect(await page.locator("body").innerText()).not.toContain(FAKE_KEY);
});

test("outra Base URL com chave salva exige a chave digitada junto", async ({ page }) => {
  await page.goto("/configuracao");
  await fieldUrl(page).fill(GATEWAY_URL);
  await fieldKey(page).fill(FAKE_KEY);
  await fieldModel(page).fill("modelo-a");
  await saveButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuração salva." })).toBeVisible();

  await fieldUrl(page).fill(OTHER_URL);
  await expect(fieldKey(page)).toHaveValue("");
  await testButton(page).click();
  await expect(result(page)).toContainText("Para testar outra Base URL, digite a API key junto (ou salve antes).");
});

test("sem chave salva, outra Base URL com a chave em branco não é bloqueada", async ({ page }) => {
  await page.goto("/configuracao");
  await fieldUrl(page).fill(GATEWAY_URL);
  await fieldModel(page).fill("modelo-a");
  await testButton(page).click();

  // Chega ao gateway falso, que recusa a chamada sem chave.
  await expect(result(page)).toContainText("Falha · HTTP 401");
  await expect(result(page)).not.toContainText("Para testar outra Base URL");
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 375, height: 760 } });

  test("/configuracao não rola na horizontal e mostra Testar e Salvar", async ({ page }) => {
    await page.goto("/configuracao");
    await expect(testButton(page)).toBeVisible();
    await expect(saveButton(page)).toBeVisible();
    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noHorizontalScroll).toBe(true);
  });
});
