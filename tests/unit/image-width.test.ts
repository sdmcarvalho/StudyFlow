import { describe, expect, it } from "vitest";

import {
  clampWidth,
  parseImageAlt,
  setImageWidth,
} from "@/features/estudo/editor/image-width";

describe("clampWidth", () => {
  it("ajusta ao intervalo 32 a 2000 e arredonda", () => {
    expect(clampWidth(10)).toBe(32);
    expect(clampWidth(5000)).toBe(2000);
    expect(clampWidth(300.7)).toBe(301);
    expect(clampWidth(32)).toBe(32);
    expect(clampWidth(2000)).toBe(2000);
  });

  it("trata valores não finitos como o mínimo", () => {
    expect(clampWidth(NaN)).toBe(32);
    expect(clampWidth(Infinity)).toBe(32);
    expect(clampWidth(-Infinity)).toBe(32);
  });
});

describe("parseImageAlt", () => {
  it("lê a largura do sufixo |N", () => {
    expect(parseImageAlt("foto|300")).toEqual({ alt: "foto", width: 300 });
  });

  it("sem sufixo devolve largura null", () => {
    expect(parseImageAlt("foto")).toEqual({ alt: "foto", width: null });
  });

  it("sufixo inválido mantém o alt inteiro", () => {
    expect(parseImageAlt("a|b")).toEqual({ alt: "a|b", width: null });
    expect(parseImageAlt("foto|0")).toEqual({ alt: "foto|0", width: null });
    expect(parseImageAlt("foto|abc")).toEqual({ alt: "foto|abc", width: null });
  });

  it("ajusta largura fora do intervalo", () => {
    expect(parseImageAlt("foto|99999")).toEqual({ alt: "foto", width: 2000 });
    expect(parseImageAlt("foto|5")).toEqual({ alt: "foto", width: 32 });
  });
});

describe("setImageWidth", () => {
  const image = "![foto](imagens/a.png)";

  function range(texto: string, token: string, from = 0) {
    const start = texto.indexOf(token, from);
    return { start, end: start + token.length };
  }

  it("grava a largura no alt da imagem indicada", () => {
    const texto = `Texto ${image} fim`;
    const { start, end } = range(texto, image);
    expect(setImageWidth(texto, start, end, 300)).toBe(
      "Texto ![foto|300](imagens/a.png) fim",
    );
  });

  it("substitui a largura existente sem acumular", () => {
    const texto = "Texto ![foto|300](imagens/a.png) fim";
    const { start, end } = range(texto, "![foto|300](imagens/a.png)");
    expect(setImageWidth(texto, start, end, 450)).toBe(
      "Texto ![foto|450](imagens/a.png) fim",
    );
  });

  it("altera só o trecho indicado, mesmo com imagens iguais", () => {
    const texto = `${image} e ${image}`;
    const second = range(texto, image, 1);
    expect(setImageWidth(texto, second.start, second.end, 200)).toBe(
      `${image} e ![foto|200](imagens/a.png)`,
    );
    const first = range(texto, image);
    expect(setImageWidth(texto, first.start, first.end, 200)).toBe(
      `![foto|200](imagens/a.png) e ${image}`,
    );
  });

  it("ajusta a largura pelo clampWidth", () => {
    const { start, end } = range(image, image);
    expect(setImageWidth(image, start, end, 5)).toBe("![foto|32](imagens/a.png)");
    expect(setImageWidth(image, start, end, 9999)).toBe(
      "![foto|2000](imagens/a.png)",
    );
  });

  it("funciona com alt vazio", () => {
    expect(setImageWidth("![](a.png)", 0, 10, 100)).toBe("![|100](a.png)");
  });

  it("mantém um sufixo inválido como parte do alt", () => {
    expect(setImageWidth("![foto|abc](a.png)", 0, 18, 100)).toBe(
      "![foto|abc|100](a.png)",
    );
  });

  it("devolve o texto sem mudanças quando o trecho não é uma imagem", () => {
    const texto = "Texto [link](url) fim";
    const { start, end } = range(texto, "[link](url)");
    expect(setImageWidth(texto, start, end, 300)).toBe(texto);
    expect(setImageWidth(texto, 0, 0, 300)).toBe(texto);
  });
});
