"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./cookie";
import { safeNext } from "./next-url";
import { verifyPassword } from "./password";
import { parseLoginInput } from "./schema";
import { createSession, deleteSession } from "./session";
import { clearFailures, isThrottled, recordFailure } from "./throttle";
import type { AuthResult } from "./types";

export type LoginResult = AuthResult<{ redirectTo: string }, "email" | "senha">;

const MSG_INVALID = "E-mail ou senha incorretos.";
const MSG_INACTIVE = "Conta desativada. Fale com o administrador.";
const MSG_THROTTLED = "Muitas tentativas. Tente novamente em alguns minutos.";

/** Entra com e-mail e senha. A ordem importa: o limite de tentativas vem antes de qualquer consulta de senha, a
 *  senha é sempre verificada (mesmo sem usuário, para o tempo não revelar se o e-mail existe) e só depois de
 *  acertá-la se diz que a conta está desativada.
 *
 *  A tentativa é contada (`recordFailure`) no mesmo instante síncrono em que o limite é conferido, antes de
 *  qualquer `await`: se fosse contada só depois do bcrypt, pedidos paralelos passariam todos pela conferência
 *  antes de a primeira falha ser registrada. O sucesso limpa a contagem; conta desativada com senha certa a mantém. */
export async function loginAction(input: unknown): Promise<LoginResult> {
  const parsed = parseLoginInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
  const { email, senha, next } = parsed.data;

  // Bloqueado: não verifica a senha nem conta nova tentativa (quem insiste não prolonga o próprio bloqueio).
  if (isThrottled(email)) return { ok: false, message: MSG_THROTTLED };
  recordFailure(email); // reserva da tentativa; nenhum await entre a conferência e esta linha

  const user = await db.user.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(senha, user?.passwordHash);
  if (!user || !passwordOk) return { ok: false, message: MSG_INVALID };
  if (!user.active) return { ok: false, message: MSG_INACTIVE };

  clearFailures(email);
  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  return { ok: true, data: { redirectTo: safeNext(next) } };
}

/** Encerra a sessão atual (se houver) e volta para o login. Sem cookie ou com sessão já apagada, só redireciona. */
export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await deleteSession(token);
  await clearSessionCookie();
  redirect("/login");
}
