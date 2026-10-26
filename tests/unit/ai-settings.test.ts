// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveAiSettings } from "@/features/ai/actions";
import { getAiSettings, getAiSettingsWithKey } from "@/features/ai/queries";
import { db } from "@/lib/db";

const KEY = "sk-secret-1234567890-VdU";

const valid = {
  baseUrl: "https://gateway.example.com/v1/",
  apiKey: KEY,
  model: "qwen-max",
  temperature: 0.5,
  timeout: 120,
  extraParams: '{"top_p": 0.8}',
};

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
