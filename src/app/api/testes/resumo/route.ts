import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    // Fetch studies with cards and their stats
    const studies = await db.studyRecord.findMany({
      where: {
        userId,
        deletedAt: null,
        cards: { some: { userId, deletedAt: null } }
      },
      select: {
        id: true,
        descricao: true,
        lastTestedAt: true,
        _count: { select: { cards: { where: { userId, deletedAt: null } } } }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });

    const summaries = [];
    for (const study of studies) {
      const lastCard = await db.card.findFirst({
        where: { studyId: study.id, userId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
      });

      const results = await db.cardResult.groupBy({
        by: ["correct"],
        where: { studyId: study.id, userId },
        _count: true
      });

      let correctAnswers = 0;
      let totalAttempts = 0;
      for (const result of results) {
        totalAttempts += result._count;
        if (result.correct) correctAnswers += result._count;
      }

      const accuracyPercent = totalAttempts > 0 ? (correctAnswers / totalAttempts) * 100 : null;

      summaries.push({
        studyId: study.id,
        studyName: study.descricao,
        lastCardCreated: lastCard?.createdAt.toISOString() ?? null,
        lastTested: study.lastTestedAt?.toISOString() ?? null,
        totalCards: study._count.cards,
        correctAnswers,
        totalAttempts,
        accuracyPercent
      });
    }

    return NextResponse.json(summaries);
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    console.error("Failed to load studies for tests:", error);
    return NextResponse.json({ error: "Failed to load studies" }, { status: 500 });
  }
}