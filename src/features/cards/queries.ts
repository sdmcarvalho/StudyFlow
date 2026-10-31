import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import type { CardRow, StudyTestSummary } from "./types";

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

/**
 * Resumo da tela de Testes: Estudos do usuário, não excluídos, com ao menos um card ativo.
 * Três consultas no total; cards excluídos e os resultados deles não entram na conta.
 */
export async function listStudyTestSummaries(): Promise<StudyTestSummary[]> {
  const userId = await getCurrentUserId();
  const activeCard = { userId, deletedAt: null };
  const studies = await db.studyRecord.findMany({
    where: { userId, deletedAt: null, cards: { some: activeCard } },
    select: { id: true, descricao: true, lastTestedAt: true, _count: { select: { cards: { where: activeCard } } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  if (!studies.length) return [];
  const studyIds = studies.map((study) => study.id);

  const [lastCards, results] = await Promise.all([
    db.card.groupBy({
      by: ["studyId"],
      where: { ...activeCard, studyId: { in: studyIds } },
      _max: { createdAt: true },
    }),
    db.cardResult.groupBy({
      by: ["studyId", "correct"],
      where: { userId, studyId: { in: studyIds }, card: activeCard },
      _count: { _all: true },
    }),
  ]);

  const lastCreated = new Map(lastCards.map((group) => [group.studyId, group._max.createdAt]));
  const tally = new Map<string, { correct: number; total: number }>();
  for (const group of results) {
    const entry = tally.get(group.studyId) ?? { correct: 0, total: 0 };
    entry.total += group._count._all;
    if (group.correct) entry.correct += group._count._all;
    tally.set(group.studyId, entry);
  }

  return studies.map((study) => {
    const { correct, total } = tally.get(study.id) ?? { correct: 0, total: 0 };
    return {
      studyId: study.id,
      studyName: study.descricao,
      lastCardCreated: lastCreated.get(study.id)?.toISOString() ?? null,
      lastTested: study.lastTestedAt?.toISOString() ?? null,
      totalCards: study._count.cards,
      correctAnswers: correct,
      totalAttempts: total,
      accuracyPercent: total > 0 ? (correct / total) * 100 : null,
    };
  });
}
