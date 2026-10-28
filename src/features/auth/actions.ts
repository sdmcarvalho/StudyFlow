"use server";

import { redirect } from "next/navigation";
import { authActionMessage } from "@/lib/auth-response";
import { getCurrentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { SESSION_EXPIRED_MESSAGE } from "./constants";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./cookie";
import { safeNext } from "./next-url";
import { hashPassword, verifyPassword } from "./password";
import { parseChangePasswordInput, parseLoginInput } from "./schema";
import { createSession, deleteSession, deleteUserSessions } from "./session";
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

export type ChangePasswordResult = AuthResult<undefined, "senhaAtual" | "novaSenha" | "confirmacao">;

const MSG_CHANGE_FAILED = "Não foi possível alterar a senha. Tente novamente.";
const MSG_WRONG_CURRENT = "Senha atual incorreta.";

/** Troca a senha do próprio usuário da sessão. O usuário vem sempre da sessão (nunca do que o cliente envia) e o hash
 *  atual é lido do banco por esse id. No sucesso, grava o novo hash e revoga todas as outras sessões do usuário,
 *  mantendo a atual. Sem limite de tentativas: quem chega aqui já tem sessão. */
export async function changePasswordAction(input: unknown): Promise<ChangePasswordResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, message: SESSION_EXPIRED_MESSAGE };

    const parsed = parseChangePasswordInput(input);
    if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
    const { senhaAtual, novaSenha } = parsed.data;

    const record = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(senhaAtual, record?.passwordHash))) {
      return { ok: false, fieldErrors: { senhaAtual: MSG_WRONG_CURRENT } };
    }

    const passwordHash = await hashPassword(novaSenha);
    await db.user.update({ where: { id: user.id }, data: { passwordHash } });
    await deleteUserSessions(user.id, await readSessionToken());
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, message: authActionMessage(error) ?? MSG_CHANGE_FAILED };
  }
}
