import { assertSuperuser } from "@/lib/current-user";
import { db } from "@/lib/db";
import type { UserRow } from "./types";

type Counts = Map<string, number>;

function toCounts(groups: { userId: string; _count: { _all: number } }[]): Counts {
  return new Map(groups.map((group) => [group.userId, group._count._all]));
}

/** Todos os usuários (SUPER primeiro, depois do mais antigo ao mais novo) com as contagens de seus itens.
 *  Só o superusuário pode chamar; devolve apenas contagens, nunca conteúdo de Estudos, Cards ou Agenda. */
export async function listUsers(): Promise<UserRow[]> {
  await assertSuperuser();

  const [users, studies, cards, schedules] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, createdAt: true } }),
    db.studyRecord.groupBy({ by: ["userId"], where: { deletedAt: null }, _count: { _all: true } }),
    db.card.groupBy({ by: ["userId"], where: { deletedAt: null }, _count: { _all: true } }),
    db.schedule.groupBy({ by: ["userId"], _count: { _all: true } }),
  ]);
  const studyCounts = toCounts(studies);
  const cardCounts = toCounts(cards);
  const scheduleCounts = toCounts(schedules);

  return users
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "SUPER" ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
    })
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email ?? "",
      role: user.role,
      active: user.active,
      createdAt: user.createdAt.toISOString(),
      studyCount: studyCounts.get(user.id) ?? 0,
      cardCount: cardCounts.get(user.id) ?? 0,
      scheduleCount: scheduleCounts.get(user.id) ?? 0,
    }));
}
