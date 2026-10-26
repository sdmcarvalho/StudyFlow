import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import type { CardRow } from "./types";

export async function listStudyCards(studyId: string): Promise<CardRow[]> {
  if (typeof studyId !== "string" || !studyId.length) return [];
  const userId = await getCurrentUserId();
  const cards = await db.card.findMany({
    where: { studyId, userId, deletedAt: null, study: { userId, deletedAt: null } },
    select: { id: true, cellId: true, tema: true, pergunta: true, resposta: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return cards.map((card) => ({ ...card, createdAt: card.createdAt.toISOString() }));
}
