"use server";

import { authActionMessage } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { parseStoredContent } from "../estudo/content-schema";
import { parseCardInput, type CardFieldErrors } from "./schema";
import type { CardRow } from "./types";

export type CardResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors?: CardFieldErrors; message?: string };
const NOT_FOUND = { ok: false, message: "Card ou Estudo não encontrado." } as const;
const FAILED = { ok: false, message: "Não foi possível salvar o card." } as const;
/** Falha de uma action: sessão inválida vira a mensagem de sessão expirada; o resto, a falha genérica. */
function failure(error: unknown) {
  const message = authActionMessage(error);
  return message ? ({ ok: false, message } as const) : FAILED;
}
const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0;
const row = (card: Omit<CardRow, "createdAt"> & { createdAt: Date }): CardRow => ({
  id: card.id, cellId: card.cellId, tema: card.tema, pergunta: card.pergunta,
  resposta: card.resposta, createdAt: card.createdAt.toISOString(),
});

export async function createCard(studyId: string, cellId: string, input: unknown): Promise<CardResult<CardRow>> {
  if (!validId(studyId) || !validId(cellId)) return NOT_FOUND;
  const parsed = parseCardInput(input);
  if (!parsed.ok) return parsed;
  try {
    const userId = await getCurrentUserId();
    return await db.$transaction(async (tx) => {
      const study = await tx.studyRecord.findFirst({ where: { id: studyId, userId, deletedAt: null } });
      if (!study) return NOT_FOUND;
      if (!parseStoredContent(study.conteudo).some((cell) => cell.id === cellId)) {
        return { ok: false, message: "A célula ainda não foi salva." } as const;
      }
      const card = await tx.card.create({ data: { userId, studyId, cellId, ...parsed.data } });
      return { ok: true, data: row(card) } as const;
    });
  } catch (error) { return failure(error); }
}

export async function updateCard(cardId: string, input: unknown): Promise<CardResult<CardRow>> {
  if (!validId(cardId)) return NOT_FOUND;
  const parsed = parseCardInput(input);
  if (!parsed.ok) return parsed;
  try {
    const userId = await getCurrentUserId();
    return await db.$transaction(async (tx) => {
      const where = { id: cardId, userId, deletedAt: null, study: { userId, deletedAt: null } };
      const { count } = await tx.card.updateMany({ where, data: parsed.data });
      if (!count) return NOT_FOUND;
      const card = await tx.card.findFirst({ where });
      return card ? { ok: true, data: row(card) } as const : NOT_FOUND;
    });
  } catch (error) { return failure(error); }
}

export async function deleteCard(cardId: string): Promise<CardResult> {
  if (!validId(cardId)) return NOT_FOUND;
  try {
    const userId = await getCurrentUserId();
    const { count } = await db.card.updateMany({
      where: { id: cardId, userId, deletedAt: null, study: { userId, deletedAt: null } },
      data: { deletedAt: new Date() },
    });
    return count ? { ok: true, data: undefined } : NOT_FOUND;
  } catch (error) { return failure(error); }
}

export async function restoreCard(cardId: string): Promise<CardResult<CardRow>> {
  if (!validId(cardId)) return NOT_FOUND;
  try {
    const userId = await getCurrentUserId();
    return await db.$transaction(async (tx) => {
      const { count } = await tx.card.updateMany({
        where: { id: cardId, userId, deletedAt: { not: null }, study: { userId, deletedAt: null } },
        data: { deletedAt: null },
      });
      if (!count) return NOT_FOUND;
      const card = await tx.card.findFirst({ where: { id: cardId, userId, study: { userId, deletedAt: null } } });
      return card ? { ok: true, data: row(card) } as const : NOT_FOUND;
    });
  } catch (error) { return failure(error); }
}

/** Registra uma resposta do Teste: o card precisa ser do usuário, estar ativo e pertencer ao Estudo informado. */
export async function recordCardResult(cardId: string, studyId: string, correct: boolean): Promise<CardResult> {
  if (!validId(cardId) || !validId(studyId)) return NOT_FOUND;
  if (typeof correct !== "boolean") return { ok: false, message: "Resultado inválido." };
  try {
    const userId = await getCurrentUserId();
    return await db.$transaction(async (tx) => {
      const card = await tx.card.findFirst({
        where: { id: cardId, studyId, userId, deletedAt: null, study: { userId, deletedAt: null } },
        select: { id: true },
      });
      if (!card) return NOT_FOUND;
      await tx.cardResult.create({ data: { cardId, studyId, userId, correct } });
      return { ok: true, data: undefined } as const;
    });
  } catch (error) { return failure(error); }
}

/** Taxa de acerto de um card ativo do usuário; `null` quando ainda não houve tentativa. */
export async function getCardAccuracy(
  cardId: string,
): Promise<CardResult<{ accuracyPercent: number | null; attempts: number }>> {
  if (!validId(cardId)) return NOT_FOUND;
  try {
    const userId = await getCurrentUserId();
    return await db.$transaction(async (tx) => {
      const card = await tx.card.findFirst({
        where: { id: cardId, userId, deletedAt: null, study: { userId, deletedAt: null } },
        select: { id: true },
      });
      if (!card) return NOT_FOUND;
      const groups = await tx.cardResult.groupBy({
        by: ["correct"],
        where: { cardId, userId },
        _count: { _all: true },
      });
      const attempts = groups.reduce((sum, group) => sum + group._count._all, 0);
      const correct = groups.find((group) => group.correct)?._count._all ?? 0;
      return { ok: true, data: { accuracyPercent: attempts > 0 ? (correct / attempts) * 100 : null, attempts } } as const;
    });
  } catch (error) { return failure(error); }
}

/**
 * Marca a data do último Teste do Estudo sem mexer na "Data atualização": o `@updatedAt` do Prisma
 * só é preservado quando o valor atual vai explícito no `data`.
 *
 * Ler o `updatedAt` e regravá-lo na mesma transação só é seguro porque o SQLite trava o banco para escrita
 * dentro da transação (nenhuma outra escrita se intercala). Se o banco mudar, coloque `updatedAt` no `where`
 * como concorrência otimista, senão uma edição concorrente teria o `updatedAt` revertido.
 */
export async function updateLastTested(studyId: string): Promise<CardResult> {
  if (!validId(studyId)) return NOT_FOUND;
  try {
    const userId = await getCurrentUserId();
    return await db.$transaction(async (tx) => {
      const where = { id: studyId, userId, deletedAt: null };
      const study = await tx.studyRecord.findFirst({ where, select: { updatedAt: true } });
      if (!study) return NOT_FOUND;
      const { count } = await tx.studyRecord.updateMany({
        where,
        data: { lastTestedAt: new Date(), updatedAt: study.updatedAt },
      });
      return count ? { ok: true, data: undefined } as const : NOT_FOUND;
    });
  } catch (error) { return failure(error); }
}
