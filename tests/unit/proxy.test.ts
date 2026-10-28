// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, SESSION_EXPIRED_MESSAGE } from "@/features/auth/constants";
import { config, proxy } from "@/proxy";

function request(path: string, cookie?: string, method = "GET") {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
}

describe("proxy", () => {
  it("sem cookie, redireciona a página para /login com o caminho e a query em next", () => {
    const response = proxy(request("/estudo?page=2"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.search).toBe("?next=%2Festudo%3Fpage%3D2");
  });

  it("sem cookie em / vai para /login sem next", () => {
    const response = proxy(request("/"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.search).toBe("");
  });

  it("sem cookie em /api/* devolve 401 com a mensagem de sessão expirada", async () => {
    const response = proxy(request("/api/cards"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: SESSION_EXPIRED_MESSAGE });
  });

  it("HEAD sem cookie também redireciona para /login", () => {
    const response = proxy(request("/estudo", undefined, "HEAD"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("sem cookie, um POST (server action) em página segue adiante: quem responde é a própria action", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = proxy(request("/estudo?page=2", undefined, method));
      expect(response.status, method).toBe(200);
      expect(response.headers.get("location"), method).toBeNull();
      expect(response.headers.get("x-middleware-next"), method).toBe("1");
    }
  });

  it("sem cookie, /api/* devolve 401 em qualquer método", async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const response = proxy(request("/api/x", undefined, method));
      expect(response.status, method).toBe(401);
      expect(await response.json()).toEqual({ message: SESSION_EXPIRED_MESSAGE });
    }
  });

  it("com cookie segue adiante, em páginas e em /api/*", () => {
    for (const method of ["GET", "POST"]) {
      for (const path of ["/estudo", "/api/cards", "/"]) {
        const response = proxy(request(path, "qualquer-valor", method));
        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("x-middleware-next")).toBe("1");
      }
    }
  });

  it("só confere a presença do cookie, não o valor", () => {
    expect(proxy(request("/estudo", "lixo")).headers.get("x-middleware-next")).toBe("1");
  });

  it("o matcher exclui /login, os estáticos do Next e o favicon, mas não caminhos que só começam com login", () => {
    expect(config.matcher).toHaveLength(1);
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/estudo", "/", "/api/cards", "/estudo/abc", "/login-foo", "/loginx/y", "/configuracao"]) {
      expect(matcher.test(path), path).toBe(true);
    }
    for (const path of ["/login", "/login/", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico"]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });
});
