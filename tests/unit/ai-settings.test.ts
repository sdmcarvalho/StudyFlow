// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));

import { saveAiSettings } from "@/features/ai/actions";
import { getAiSettings, getAiSettingsWithKey } from "@/features/ai/queries";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

const KEY = "sk-secret-1234567890-VdU";

const valid = {
  baseUrl: "https://gateway.example.com/v1/",
  apiKey: KEY,
  model: "qwen-max",
  temperature: 0.5,
  timeout: 120,
  extraParams: '{"top_p": 0.8}',
};

beforeEach(async () => {
  signOut();
  await signInAs(await createTestUser());
});

afterEach(async () => {
  await db.aiSettings.deleteMany();
});

describe("getAiSettings", () => {
  it("sem linha devolve os padrões", async () => {
    expect(await getAiSettings()).toEqual({
      baseUrl: "",
      apiKeyMasked: "",
      hasKey: false,
      model: "",
      temperature: 0.2,
      timeout: 300,
      extraParams: "",
    });
  });
});

describe("saveAiSettings", () => {
  it("grava e devolve o tipo público, sem a propriedade apiKey", async () => {
    const result = await saveAiSettings(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.hasKey).toBe(true);
    expect(result.data.apiKeyMasked).toBe("sk-s…VdU".replace("VdU", KEY.slice(-4)));
    expect(result.data.apiKeyMasked).not.toContain(KEY);
    expect(result.data).not.toHaveProperty("apiKey");
    expect(result.data.baseUrl).toBe("https://gateway.example.com/v1");
    expect(result.data.model).toBe("qwen-max");
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(await getAiSettings())).not.toContain(KEY);
  });

  it("apiKey vazia mantém a chave guardada e atualiza o resto", async () => {
    await saveAiSettings(valid);
    const result = await saveAiSettings({ ...valid, apiKey: "", model: "outro-modelo" });
    expect(result.ok).toBe(true);
    const stored = await getAiSettingsWithKey();
    expect(stored.apiKey).toBe(KEY);
    expect(stored.model).toBe("outro-modelo");
    expect(stored.hasKey).toBe(true);
  });

  it("apiKey nova substitui a chave", async () => {
    await saveAiSettings(valid);
    await saveAiSettings({ ...valid, apiKey: "sk-nova-chave-9999" });
    expect((await getAiSettingsWithKey()).apiKey).toBe("sk-nova-chave-9999");
  });

  it("outra URL com chave em branco e chave salva é recusada e não grava nada", async () => {
    await saveAiSettings(valid);
    const before = await db.aiSettings.findFirstOrThrow();
    const result = await saveAiSettings({ ...valid, baseUrl: "https://atacante.example.com/v1", apiKey: "", model: "outro" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.apiKey).toBe("Digite a API key da nova URL (a chave salva só vale para a URL salva).");
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(await db.aiSettings.findFirstOrThrow()).toEqual(before);
  });

  it("outra URL com chave nova digitada é salva", async () => {
    await saveAiSettings(valid);
    const result = await saveAiSettings({ ...valid, baseUrl: "https://novo.example.com/v1", apiKey: "sk-nova-chave-9999" });
    expect(result.ok).toBe(true);
    const stored = await getAiSettingsWithKey();
    expect(stored.baseUrl).toBe("https://novo.example.com/v1");
    expect(stored.apiKey).toBe("sk-nova-chave-9999");
  });

  it("mesma URL (barra final e espaços diferentes) com chave em branco mantém a chave", async () => {
    await saveAiSettings(valid);
    const result = await saveAiSettings({ ...valid, baseUrl: "  https://gateway.example.com/v1//  ", apiKey: "", model: "m2" });
    expect(result.ok).toBe(true);
    const stored = await getAiSettingsWithKey();
    expect(stored.apiKey).toBe(KEY);
    expect(stored.model).toBe("m2");
  });

  it("sem chave salva, outra URL com chave em branco é salva (gateway sem chave)", async () => {
    await saveAiSettings({ ...valid, apiKey: "" });
    const result = await saveAiSettings({ ...valid, baseUrl: "http://localhost:8080/v1", apiKey: "" });
    expect(result.ok).toBe(true);
    const stored = await getAiSettingsWithKey();
    expect(stored.baseUrl).toBe("http://localhost:8080/v1");
    expect(stored.apiKey).toBe("");
  });

  it("entrada inválida devolve fieldErrors e não grava nada", async () => {
    const result = await saveAiSettings({ ...valid, baseUrl: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.baseUrl).toBeTruthy();
    expect(await db.aiSettings.count()).toBe(0);
  });

  it("duas chamadas seguidas mantêm uma única linha", async () => {
    await saveAiSettings(valid);
    await saveAiSettings({ ...valid, timeout: 200 });
    expect(await db.aiSettings.count()).toBe(1);
    expect((await getAiSettings()).timeout).toBe(200);
  });
});
