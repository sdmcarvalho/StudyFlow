import { describe, expect, it } from "vitest";
import { resolveImageSrc } from "@/features/estudo/editor/resolve-image-src";

const ID = "abc123";

describe("resolveImageSrc", () => {
  it("troca imagens/<arquivo> pela rota do Estudo", () => {
    expect(resolveImageSrc("imagens/a.png", ID)).toBe("/estudo/abc123/imagens/a.png");
  });

  it("decodifica uma vez e recodifica o nome do arquivo", () => {
    expect(resolveImageSrc("imagens/a%20b.png", ID)).toBe("/estudo/abc123/imagens/a%20b.png");
    expect(resolveImageSrc("imagens/a b.png", ID)).toBe("/estudo/abc123/imagens/a%20b.png");
  });

  it("deixa URLs http(s) passarem sem mudança", () => {
    expect(resolveImageSrc("https://x.com/a.png", ID)).toBe("https://x.com/a.png");
    expect(resolveImageSrc("http://x.com/a.png?w=1", ID)).toBe("http://x.com/a.png?w=1");
    expect(resolveImageSrc("HTTPS://x.com/a.png", ID)).toBe("HTTPS://x.com/a.png");
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "vbscript:msgbox(1)",
    "data:image/png;base64,AA",
    "file:///C:/x.png",
    "//evil.com/a.png",
    "C:\\x.png",
    "/etc/x",
    "imagens/../x.png",
    "imagens/%2e%2e/x.png",
    "imagens/%2E%2E%2Fx.png",
    "imagens/a%2Fb.png",
    "imagens/a%5Cb.png",
    "imagens/sub/a.png",
    "imagens/.oculto.png",
    "imagens/..",
    "imagens/a:b.png",
    "imagens/",
    "imagens/%E0%A4%A",
    "..\\x.png",
    "a.png",
    "./imagens/a.png",
    "https:/x.com/a.png",
    "",
  ])("bloqueia %j", (src) => {
    expect(resolveImageSrc(src, ID)).toBeNull();
  });
});
