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
