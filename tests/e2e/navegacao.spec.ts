import { expect, test } from "@playwright/test";
import { resetData } from "./helpers";

test.beforeEach(() => resetData());

for (const [label, path] of [
  ["Testes", "/testes"],
  ["Agenda", "/agenda"],
] as const) {
  test(`${label}: mostra "Em breve" e marca o item ativo`, async ({ page }) => {
    await page.goto("/estudo");
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: label }).click();

    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Em breve" })).toBeVisible();
    await expect(page.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  });
}

test.describe("mobile", () => {
  test.use({ viewport: { width: 375, height: 760 } });

  test("o menu abre o drawer e fecha com Escape", async ({ page }) => {
    await page.goto("/estudo");
    const toggle = page.getByRole("button", { name: "Abrir menu" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    const opened = page.getByRole("button", { name: "Fechar menu" });
    await expect(opened).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: "Agenda" })).toBeInViewport();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Abrir menu" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("link", { name: "Agenda" })).not.toBeInViewport();
  });
});
