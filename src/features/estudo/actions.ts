"use server";

import { revalidatePath } from "next/cache";
import { authActionMessage } from "@/lib/auth-response";
import { AuthError, getCurrentUser, getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { parseContent, serializeContent } from "./content-schema";
import { folderKey, normalizeFolderPath } from "./folder-path";
import { isFolderAllowed, userRoot } from "./folder-scope";
import { copyImages, ensureFolder } from "./folders";
import { parseStudyRecordInput, type FieldErrors } from "./schema";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors?: FieldErrors; message?: string };

const NOT_FOUND = { ok: false, message: "Registro não encontrado." } as const;
const SAVE_FAILED = { ok: false, message: "Não foi possível salvar. Tente novamente." } as const;

/** Argumentos de server actions vêm do cliente: um objeto de filtro como id atingiria vários registros. */
function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

/** Falha de uma action: sessão inválida vira a mensagem de sessão expirada; o resto, a falha genérica. */
function failure(error: unknown) {
  const message = authActionMessage(error);
  return message ? ({ ok: false, message } as const) : SAVE_FAILED;
}

function done(): ActionResult {
  revalidatePath("/estudo");
  return { ok: true, data: undefined };
}

const folderError = (pasta: string) => ({ ok: false, fieldErrors: { pasta } }) as const;
const DUPLICATE_FOLDER = folderError("Já existe um Estudo usando esta pasta.");
const MKDIR_FAILED = folderError("Não foi possível criar a pasta.");
const outsideRoot = (root: string) => folderError(`A pasta precisa ficar dentro de ${root}.`);

/** Raiz das pastas do usuário da sessão (as pastas dos Estudos ficam todas dentro dela). */
async function currentUserRoot(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("unauthenticated");
  return userRoot(user);
}

/** Outro Estudo ativo do usuário (exceto `exceptId`) já usa a pasta? Ignora caixa e barra final. */
async function isFolderInUse(userId: string, pasta: string, exceptId?: string): Promise<boolean> {
  const key = folderKey(pasta);
  const active = await db.studyRecord.findMany({
    where: { userId, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { pasta: true },
  });
  return active.some((record) => folderKey(record.pasta) === key);
}

export async function createStudyRecord(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseStudyRecordInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  try {
    const userId = await getCurrentUserId();
    if (await isFolderInUse(userId, parsed.data.pasta)) return DUPLICATE_FOLDER;
    const root = await currentUserRoot();
    if (!(await isFolderAllowed(root, parsed.data.pasta))) return outsideRoot(root);
    // A pasta existe no disco antes de o registro existir no banco.
    if (!(await ensureFolder(parsed.data.pasta))) return MKDIR_FAILED;
    const record = await db.studyRecord.create({ data: { userId, ...parsed.data } });
    revalidatePath("/estudo");
    return { ok: true, data: { id: record.id } };
  } catch (error) {
    return failure(error);
  }
}

export async function updateStudyRecord(id: string, input: unknown): Promise<ActionResult> {
  if (!isValidId(id)) return NOT_FOUND;
  const parsed = parseStudyRecordInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  try {
    const userId = await getCurrentUserId();
    // Busca antes de mexer no disco: id inexistente ou alheio não cria pasta nenhuma.
    const current = await db.studyRecord.findFirst({ where: { id, userId, deletedAt: null } });
    if (!current) return NOT_FOUND;
    if (await isFolderInUse(userId, parsed.data.pasta, id)) return DUPLICATE_FOLDER;
    // Estudo antigo com a pasta fora da raiz continua editável enquanto a pasta não muda.
    if (folderKey(parsed.data.pasta) !== folderKey(current.pasta)) {
      const root = await currentUserRoot();
      if (!(await isFolderAllowed(root, parsed.data.pasta))) return outsideRoot(root);
    }
    if (!(await ensureFolder(parsed.data.pasta))) return MKDIR_FAILED;
    // Mudou de pasta: as imagens vão junto (cópia; a pasta antiga fica intacta). O Markdown usa
    // caminhos relativos (imagens/...), então continua válido. Pasta legada (não absoluta) não é
    // lida: um caminho relativo seria resolvido a partir do diretório do servidor.
    const previous = normalizeFolderPath(current.pasta);
    if (previous.ok && folderKey(previous.path) !== folderKey(parsed.data.pasta)) {
      await copyImages(previous.path, parsed.data.pasta);
    }
    const { count } = await db.studyRecord.updateMany({
      where: { id, userId, deletedAt: null },
      data: parsed.data,
    });
    return count === 0 ? NOT_FOUND : done();
  } catch (error) {
    return failure(error);
  }
}

export async function saveStudyContent(
  id: string,
  cells: unknown,
): Promise<ActionResult<{ savedAt: string }>> {
  if (!isValidId(id)) return NOT_FOUND;
  const parsed = parseContent(cells);
  if (!parsed.ok) return SAVE_FAILED;

  try {
    const userId = await getCurrentUserId();
    // updateMany com { id, userId, deletedAt: null }: o @updatedAt também muda a "Data atualização".
    const { count } = await db.studyRecord.updateMany({
      where: { id, userId, deletedAt: null },
      data: { conteudo: serializeContent(parsed.cells) },
    });
    if (count === 0) return NOT_FOUND;
    revalidatePath("/estudo");
    return { ok: true, data: { savedAt: new Date().toISOString() } };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteStudyRecord(id: string): Promise<ActionResult> {
  if (!isValidId(id)) return NOT_FOUND;
  try {
    const userId = await getCurrentUserId();
    const record = await db.studyRecord.findFirst({ where: { id, userId, deletedAt: null } });
    if (!record) return NOT_FOUND;
    // updatedAt explícito: a exclusão não pode mudar a posição do registro na lista.
    await db.studyRecord.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date(), updatedAt: record.updatedAt },
    });
    return done();
  } catch (error) {
    return failure(error);
  }
}

export async function restoreStudyRecord(id: string): Promise<ActionResult> {
  if (!isValidId(id)) return NOT_FOUND;
  try {
    const userId = await getCurrentUserId();
    const record = await db.studyRecord.findFirst({ where: { id, userId, deletedAt: { not: null } } });
    if (!record) return NOT_FOUND;
    // Enquanto estava excluído, outro Estudo pode ter passado a usar a pasta: continua excluído.
    if (await isFolderInUse(userId, record.pasta, id)) return { ok: false, message: DUPLICATE_FOLDER.fieldErrors.pasta };
    await db.studyRecord.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null, updatedAt: record.updatedAt },
    });
    return done();
  } catch (error) {
    return failure(error);
  }
}
