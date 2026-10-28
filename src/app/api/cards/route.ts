import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const studyId = searchParams.get("studyId");

  if (!studyId) {
    return NextResponse.json({ error: "studyId is required" }, { status: 400 });
  }

  try {
    const userId = await getCurrentUserId();
    const cards = await db.card.findMany({
      where: { studyId, userId, deletedAt: null },
      select: { id: true, cellId: true, tema: true, pergunta: true, resposta: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const serialized = cards.map((card) => ({
      ...card,
      createdAt: card.createdAt.toISOString(),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    console.error("Failed to fetch cards:", error);
    return NextResponse.json({ error: "Failed to fetch cards" }, { status: 500 });
  }
}