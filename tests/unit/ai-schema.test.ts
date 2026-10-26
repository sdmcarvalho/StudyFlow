import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_TIMEOUT,
  maskKey,
  normalizeBaseUrl,
  parseAiSettingsInput,
  parseExtraParams,
} from "@/features/ai/schema";

const valid = {
  baseUrl: "https://gw.exemplo.com/v1",
  apiKey: "sk-abc",
  model: "m1",
  temperature: "0.5",
  timeout: "120",
  extraParams: "",
};

describe("parseAiSettingsInput", () => {
  it("aceita entrada válida, aplica trim e converte números", () => {
    const result = parseAiSettingsInput({
      baseUrl: " https://gw.exemplo.com/v1/ ",
      apiKey: " sk-abc\n",
      model: "m1",
      temperature: "0.5",
      timeout: "120",
      extraParams: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.baseUrl).toBe("https://gw.exemplo.com/v1");
    expect(result.data.apiKey).toBe("sk-abc");
    expect(result.data.temperature).toBe(0.5);
    expect(result.data.timeout).toBe(120);
  });

  it("aceita números já numéricos", () => {
    const result = parseAiSettingsInput({ ...valid, temperature: 1, timeout: 30 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.temperature).toBe(1);
    expect(result.data.timeout).toBe(30);
  });

  it("expõe os padrões", () => {
    expect(DEFAULT_TEMPERATURE).toBe(0.2);
    expect(DEFAULT_TIMEOUT).toBe(300);
  });

  it("rejeita baseUrl vazio", () => {
    const result = parseAiSettingsInput({ ...valid, baseUrl: "  " });
    expect(result).toEqual({ ok: false, fieldErrors: { baseUrl: "Informe a URL do gateway." } });
  });

  it.each(["ftp://x", "não é url"])("rejeita baseUrl %j", (baseUrl) => {
    const result = parseAiSettingsInput({ ...valid, baseUrl });
    expect(result).toEqual({ ok: false, fieldErrors: { baseUrl: "Use uma URL http ou https válida." } });
  });

  it.each(["3", "", "-0.1", "abc"])("rejeita temperatura %j", (temperature) => {
    const result = parseAiSettingsInput({ ...valid, temperature });
    expect(result).toEqual({ ok: false, fieldErrors: { temperature: "Use um valor entre 0 e 2." } });
  });

  it.each(["5", "601", "10.5", ""])("rejeita timeout %j", (timeout) => {
    const result = parseAiSettingsInput({ ...valid, timeout });
    expect(result).toEqual({ ok: false, fieldErrors: { timeout: "Use um valor inteiro entre 10 e 600." } });
  });

  it("rejeita model com mais de 200 caracteres e aceita model vazio", () => {
    const tooLong = parseAiSettingsInput({ ...valid, model: "a".repeat(201) });
    expect(tooLong).toEqual({ ok: false, fieldErrors: { model: "Use no máximo 200 caracteres." } });

    expect(parseAiSettingsInput({ ...valid, model: "a".repeat(200) }).ok).toBe(true);
    expect(parseAiSettingsInput({ ...valid, model: "" }).ok).toBe(true);
  });

  it("aceita apiKey vazia (mantém a chave salva)", () => {
    const result = parseAiSettingsInput({ ...valid, apiKey: "" });
    expect(result.ok).toBe(true);
  });

  it("repete a mensagem de parseExtraParams no campo extraParams", () => {
    const result = parseAiSettingsInput({ ...valid, extraParams: "[1]" });
    expect(result).toEqual({
      ok: false,
      fieldErrors: { extraParams: 'Parâmetros extras devem ser um objeto JSON, por exemplo {"top_p": 0.8}' },
    });
  });

  it("trata entrada que não é objeto", () => {
    const result = parseAiSettingsInput(null);
    expect(result.ok).toBe(false);
  });
});

describe("normalizeBaseUrl", () => {
  it("remove espaços e barras finais", () => {
    expect(normalizeBaseUrl("  https://a.com/v1//  ")).toBe("https://a.com/v1");
  });

  it.each(["", "ftp://x", "não é url", "https://"])("devolve null para %j", (text) => {
    expect(normalizeBaseUrl(text)).toBeNull();
  });
});

describe("parseExtraParams", () => {
  it("aceita vazio", () => {
    expect(parseExtraParams("")).toEqual({ ok: true, value: {} });
    expect(parseExtraParams("   ")).toEqual({ ok: true, value: {} });
  });

  it("aceita objeto JSON", () => {
    expect(parseExtraParams('{"top_p":0.8}')).toEqual({ ok: true, value: { top_p: 0.8 } });
  });

  it("rejeita JSON inválido", () => {
    const result = parseExtraParams("{oops");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.startsWith("JSON inválido em Parâmetros extras:")).toBe(true);
  });

  it.each(["[1]", "1", '"x"', "null"])("rejeita %j que não é objeto", (text) => {
    expect(parseExtraParams(text)).toEqual({
      ok: false,
      message: 'Parâmetros extras devem ser um objeto JSON, por exemplo {"top_p": 0.8}',
    });
  });

  it("rejeita chaves reservadas", () => {
    expect(parseExtraParams('{"model":"x","stream":true}')).toEqual({
      ok: false,
      message: "Parâmetros extras não podem definir: model, stream",
    });
  });
});

describe("maskKey", () => {
  it("mostra início e fim de chaves longas", () => {
    expect(maskKey("sk-abcdefghij1234")).toBe("sk-a…1234");
  });

  it("esconde chaves curtas", () => {
    expect(maskKey("curta")).toBe("…");
  });

  it("devolve vazio sem chave", () => {
    expect(maskKey("")).toBe("");
  });
});
