"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
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

function done(): ActionResult {
  revalidatePath("/estudo");
  return { ok: true, data: undefined };
}

export async function createStudyRecord(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parseStudyRecordInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  try {
    const userId = await getCurrentUserId();
    const record = await db.studyRecord.create({ data: { userId, ...parsed.data } });
    revalidatePath("/estudo");
    return { ok: true, data: { id: record.id } };
  } catch {
    return SAVE_FAILED;
  }
}

export async function updateStudyRecord(id: string, input: unknown): Promise<ActionResult> {
  if (!isValidId(id)) return NOT_FOUND;
  const parsed = parseStudyRecordInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  try {
    const userId = await getCurrentUserId();
    const { count } = await db.studyRecord.updateMany({
      where: { id, userId, deletedAt: null },
      data: parsed.data,
    });
    return count === 0 ? NOT_FOUND : done();
  } catch {
    return SAVE_FAILED;
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
  } catch {
    return SAVE_FAILED;
  }
}

export async function restoreStudyRecord(id: string): Promise<ActionResult> {
  if (!isValidId(id)) return NOT_FOUND;
  try {
    const userId = await getCurrentUserId();
    const record = await db.studyRecord.findFirst({ where: { id, userId, deletedAt: { not: null } } });
    if (!record) return NOT_FOUND;
    await db.studyRecord.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null, updatedAt: record.updatedAt },
    });
    return done();
  } catch {
    return SAVE_FAILED;
  }
}
