"use server";

import { revalidatePath } from "next/cache";
import { slugFolderName, uniqueFolderName } from "@/features/auth/folder-name";
import { hashPassword } from "@/features/auth/password";
import { normalizeEmail, parseCreateUserInput, parseResetPasswordInput } from "@/features/auth/schema";
import { deleteUserSessions } from "@/features/auth/session";
import type { AuthResult } from "@/features/auth/types";
import { authActionMessage } from "@/lib/auth-response";
import { assertSuperuser } from "@/lib/current-user";
import { existingBaseFolderNames } from "@/features/estudo/folders";
import { db } from "@/lib/db";

type Failure = { ok: false; message: string };

const NOT_FOUND: Failure = { ok: false, message: "Usuário não encontrado." };
const SAVE_FAILED: Failure = { ok: false, message: "Não foi possível salvar. Tente novamente." };
const DUPLICATE_EMAIL = "Já existe um usuário com este e-mail.";
const CONFIRM_EMAIL = "Digite o e-mail do usuário para confirmar.";

/** Toda action desta tela começa aqui: null se quem chama é o superusuário, senão a resposta de falha. */
async function guard(): Promise<Failure | null> {
  try {
    await assertSuperuser();
    return null;
  } catch (error) {
    const message = authActionMessage(error);
    if (message) return { ok: false, message };
    throw error;
  }
}

function done<T>(data: T): { ok: true; data: T } {
  revalidatePath("/usuarios");
  return { ok: true, data };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** O alvo de reset/ativar/excluir: precisa existir e ser USER. O SUPER (inclusive quem está logado) nunca é alvo.
 *  O id vem do cliente: algo que não é texto (um objeto de filtro) atingiria vários registros. */
async function findTarget(userId: unknown) {
  if (typeof userId !== "string" || userId.length === 0) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
  return user && user.role === "USER" ? user : null;
}

export async function createUser(input: unknown): Promise<AuthResult<{ id: string }, "nome" | "email" | "senha">> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = parseCreateUserInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
  const { nome, email, senha } = parsed.data;

  const duplicate = { ok: false, fieldErrors: { email: DUPLICATE_EMAIL } } as const;
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return duplicate;

  const passwordHash = await hashPassword(senha);
  // Duas tentativas: a segunda cobre a corrida em que outro cadastro tomou a mesma pasta entre a leitura e a gravação.
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await db.user.findMany({ where: { folderName: { not: null } }, select: { folderName: true } });
    // Também o que já está no disco: as pastas de usuários excluídos ficam lá, e o novo não pode herdá-las.
    const taken = [
      ...existing.flatMap((row) => (row.folderName ? [row.folderName] : [])),
      ...(await existingBaseFolderNames()),
    ];
    const folderName = uniqueFolderName(slugFolderName(nome), taken);
    try {
      const user = await db.user.create({
        data: { name: nome, email, passwordHash, folderName, role: "USER", active: true },
        select: { id: true },
      });
      return done({ id: user.id });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Violação de unicidade: ou o e-mail foi tomado agora, ou a pasta.
      if (await db.user.findUnique({ where: { email }, select: { id: true } })) return duplicate;
    }
  }
  return SAVE_FAILED;
}

export async function resetUserPassword(userId: string, input: unknown): Promise<AuthResult<undefined, "novaSenha">> {
  const denied = await guard();
  if (denied) return denied;

  const target = await findTarget(userId);
  if (!target) return NOT_FOUND;
  const parsed = parseResetPasswordInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  const passwordHash = await hashPassword(parsed.data.novaSenha);
  const { count } = await db.user.updateMany({ where: { id: target.id, role: "USER" }, data: { passwordHash } });
  if (count === 0) return NOT_FOUND;
  // Quem tinha a senha antiga (ou uma sessão aberta com ela) precisa entrar de novo.
  await deleteUserSessions(target.id);
  return done(undefined);
}

export async function setUserActive(userId: string, active: boolean): Promise<AuthResult> {
  const denied = await guard();
  if (denied) return denied;

  const target = await findTarget(userId);
  if (!target) return NOT_FOUND;
  if (typeof active !== "boolean") return SAVE_FAILED;

  const { count } = await db.user.updateMany({ where: { id: target.id, role: "USER" }, data: { active } });
  if (count === 0) return NOT_FOUND;
  if (!active) await deleteUserSessions(target.id);
  return done(undefined);
}

/** Apaga as linhas do banco do usuário (e só dele). As pastas no disco nunca são tocadas. */
export async function deleteUser(
  userId: string,
  emailConfirmacao: string,
): Promise<AuthResult<undefined, "emailConfirmacao">> {
  const denied = await guard();
  if (denied) return denied;

  const target = await findTarget(userId);
  if (!target) return NOT_FOUND;

  const expected = target.email ? normalizeEmail(target.email) : "";
  if (typeof emailConfirmacao !== "string" || !expected || normalizeEmail(emailConfirmacao) !== expected) {
    return { ok: false, fieldErrors: { emailConfirmacao: CONFIRM_EMAIL } };
  }

  // Uma transação: ou apaga tudo do usuário, ou nada. A ordem respeita as chaves estrangeiras.
  const where = { userId: target.id };
  try {
    await db.$transaction([
      db.cardResult.deleteMany({ where }),
      db.schedule.deleteMany({ where }),
      db.card.deleteMany({ where }),
      db.studyRecord.deleteMany({ where }), // inclusive os da lixeira
      db.aiSettings.deleteMany({ where }),
      db.session.deleteMany({ where }),
      db.user.deleteMany({ where: { id: target.id, role: "USER" } }),
    ]);
  } catch {
    return SAVE_FAILED;
  }
  return done(undefined);
}
