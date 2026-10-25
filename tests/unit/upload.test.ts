import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadImage } from "@/features/estudo/editor/upload";

const FAILED = "Não foi possível salvar a imagem.";

function png(name = "foto.png"): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(impl: (...args: unknown[]) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadImage", () => {
  it("faz POST para /estudo/ID/imagens com FormData contendo file", async () => {
    const fetchMock = mockFetch(async () => jsonResponse(200, { path: "imagens/foto-1.png", alt: "foto" }));
    const file = png();
    await uploadImage("ID", file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/estudo/ID/imagens");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
  });

  it("codifica o id na URL", async () => {
    const fetchMock = mockFetch(async () => jsonResponse(200, { path: "imagens/a.png", alt: "a" }));
    await uploadImage("a/b c", png());
    expect(fetchMock.mock.calls[0][0]).toBe("/estudo/a%2Fb%20c/imagens");
  });

  it("200 { path, alt } vira ok: true", async () => {
    mockFetch(async () => jsonResponse(200, { path: "imagens/foto-20261025-101530.png", alt: "foto" }));
    await expect(uploadImage("ID", png())).resolves.toEqual({
      ok: true,
      path: "imagens/foto-20261025-101530.png",
      alt: "foto",
    });
  });

  it("400 { message } repassa a mensagem", async () => {
    mockFetch(async () => jsonResponse(400, { message: "Envie uma imagem PNG, JPG, GIF ou WebP." }));
    await expect(uploadImage("ID", png())).resolves.toEqual({
      ok: false,
      message: "Envie uma imagem PNG, JPG, GIF ou WebP.",
    });
  });

  it("fetch rejeitando vira a mensagem padrão", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(uploadImage("ID", png())).resolves.toEqual({ ok: false, message: FAILED });
  });

  it("JSON inválido vira a mensagem padrão", async () => {
    mockFetch(async () => new Response("<html>erro</html>", { status: 200 }));
    await expect(uploadImage("ID", png())).resolves.toEqual({ ok: false, message: FAILED });
  });

  it("erro sem message (ou 500 em HTML) vira a mensagem padrão", async () => {
    mockFetch(async () => jsonResponse(500, {}));
    await expect(uploadImage("ID", png())).resolves.toEqual({ ok: false, message: FAILED });
    mockFetch(async () => new Response("Internal Server Error", { status: 500 }));
    await expect(uploadImage("ID", png())).resolves.toEqual({ ok: false, message: FAILED });
  });

  it("200 com corpo inesperado vira a mensagem padrão", async () => {
    mockFetch(async () => jsonResponse(200, { path: "../fora.png", alt: "x" }));
    await expect(uploadImage("ID", png())).resolves.toEqual({ ok: false, message: FAILED });
    mockFetch(async () => jsonResponse(200, { alt: "x" }));
    await expect(uploadImage("ID", png())).resolves.toEqual({ ok: false, message: FAILED });
  });
});
