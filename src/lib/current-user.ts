import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { readSessionToken } from "@/features/auth/cookie";
import { findSessionUser } from "@/features/auth/session";
import type { SessionUser } from "@/features/auth/types";

export class AuthError extends Error {
  readonly code: "unauthenticated" | "forbidden";

  constructor(code: "unauthenticated" | "forbidden") {
    super(code === "unauthenticated" ? "Sessão expirada, entre novamente." : "Acesso negado.");
    this.name = "AuthError";
    this.code = code;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/** Usuário da sessão atual (lida do cookie e conferida no banco), ou null. Memoizado por render. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return findSessionUser(await readSessionToken());
});

/** Para actions, queries e rotas: lança AuthError("unauthenticated") sem sessão válida. */
export async function getCurrentUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("unauthenticated");
  return user.id;
}

/** Para actions e rotas do superusuário: "unauthenticated" sem sessão, "forbidden" se não for SUPER. */
export async function assertSuperuser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("unauthenticated");
  if (user.role !== "SUPER") throw new AuthError("forbidden");
  return user;
}

/** Para páginas e layouts: redireciona para /login sem sessão. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para páginas do superusuário: /login sem sessão, 404 para quem não é SUPER. */
export async function requireSuperuser(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER") notFound();
  return user;
}
