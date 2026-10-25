import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  contentTypeFor,
  detectImageKind,
  isSafeImageFileName,
  safeImageName,
} from "@/features/estudo/images";

/** Cabeçalho seguido de zeros até `length` bytes. */
function bytes(header: number[] | string, length = 16): Uint8Array {
  const head = typeof header === "string" ? Array.from(header, (c) => c.charCodeAt(0)) : header;
  const out = new Uint8Array(Math.max(length, head.length));
  out.set(head);
  return out;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("detectImageKind", () => {
  it("reconhece PNG, JPG, GIF e WebP pela assinatura", () => {
    expect(detectImageKind(bytes(PNG))).toBe("png");
    expect(detectImageKind(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(detectImageKind(bytes("GIF87a"))).toBe("gif");
    expect(detectImageKind(bytes("GIF89a"))).toBe("gif");
    const webp = bytes("RIFF");
    webp.set([0x24, 0x00, 0x00, 0x00], 4);
    webp.set(Array.from("WEBP", (c) => c.charCodeAt(0)), 8);
    expect(detectImageKind(webp)).toBe("webp");
  });

  it("devolve null para texto, SVG, vazio e menos de 12 bytes", () => {
    expect(detectImageKind(bytes("isto é só um texto qualquer"))).toBeNull();
    expect(detectImageKind(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageKind(new Uint8Array())).toBeNull();
    expect(detectImageKind(new Uint8Array(PNG))).toBeNull(); // 8 bytes
    expect(detectImageKind(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(detectImageKind(bytes("RIFF....AVI "))).toBeNull();
  });

  it("MAX_IMAGE_BYTES é 10 MB", () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("safeImageName", () => {
  const now = new Date(2026, 9, 25, 10, 15, 30);

  it("limpa o nome, acrescenta data e hora e usa a extensão do tipo", () => {
    expect(safeImageName("Foto da Praia (1).JPG", now, "jpg")).toBe("foto-da-praia-1-20261025-101530.jpg");
  });

  it("remove acentos", () => {
    expect(safeImageName("Ação Ônibus.png", now, "png")).toBe("acao-onibus-20261025-101530.png");
  });

  it("nome só com símbolos vira imagem-<data>", () => {
    expect(safeImageName("@#$%.png", now, "png")).toBe("imagem-20261025-101530.png");
    expect(safeImageName("", now, "png")).toBe("imagem-20261025-101530.png");
  });

  it("a extensão vem do kind, nunca do nome original", () => {
    expect(safeImageName("foto.gif", now, "png")).toBe("foto-20261025-101530.png");
    expect(safeImageName("x.svg", now, "webp")).toBe("x-20261025-101530.webp");
  });

  it("o resultado sempre é um nome seguro", () => {
    expect(isSafeImageFileName(safeImageName("..\\..\\a/b <c>.png", now, "gif"))).toBe(true);
    expect(isSafeImageFileName(safeImageName("x".repeat(500), now, "png"))).toBe(true);
    expect(safeImageName("x".repeat(500), now, "png").length).toBeLessThanOrEqual(100);
  });
});

describe("isSafeImageFileName", () => {
  it.each(["a.png", "foto-1.webp", "A_b.JPG", "x.jpeg", "y.gif"])("aceita %s", (name) => {
    expect(isSafeImageFileName(name)).toBe(true);
  });

  it.each([
    "..\\x.png",
    "a/b.png",
    "x.svg",
    "x.png.exe",
    ".png",
    "a b.png",
    "%2e%2e.png",
    "..",
    "",
    "con.png",
    "NUL.jpg",
  ])("recusa %s", (name) => {
    expect(isSafeImageFileName(name)).toBe(false);
  });
});

describe("contentTypeFor", () => {
  it("devolve o tipo das extensões permitidas", () => {
    expect(contentTypeFor("a.jpg")).toBe("image/jpeg");
    expect(contentTypeFor("a.jpeg")).toBe("image/jpeg");
    expect(contentTypeFor("a.png")).toBe("image/png");
    expect(contentTypeFor("a.gif")).toBe("image/gif");
    expect(contentTypeFor("a.webp")).toBe("image/webp");
  });

  it("devolve null para as outras", () => {
    expect(contentTypeFor("a.svg")).toBeNull();
    expect(contentTypeFor("a")).toBeNull();
    expect(contentTypeFor("a.html")).toBeNull();
  });
});
