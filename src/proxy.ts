import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
// Só constantes: o proxy roda antes de toda rota e não pode puxar o banco nem o bcrypt.
import { SESSION_COOKIE, SESSION_EXPIRED_MESSAGE } from "@/features/auth/constants";

/** Checagem otimista: só olha se o cookie de sessão existe (não se vale). Quem confere de verdade é
 *  `requireUser`/`getCurrentUserId`, nas páginas, actions e rotas. */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.json({ message: SESSION_EXPIRED_MESSAGE }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Tudo, menos /login (e o que está embaixo dele), os arquivos estáticos do Next e o favicon.
  // `login(?:/|$)` ancora o fim: caminhos que só começam com "login" (ex.: /login-foo) continuam protegidos.
  matcher: ["/((?!login(?:/|$)|_next/static|_next/image|favicon\.ico).*)"],
};
