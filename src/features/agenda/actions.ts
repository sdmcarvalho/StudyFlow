"use server";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export type ScheduleInput = {
  studyId: string;
  studyName: string;
};

/**
 * Cria 6 agendamentos para um estudo, seguindo as regras de revisão espaçada.
 * Verifica se já existem agendamentos ativos antes de criar novos.
 */
export async function createSchedules(
  input: ScheduleInput & { force?: boolean }
): Promise<ActionResult<{ count: number; hasActive: boolean }>> {
  if (typeof input.studyId !== "string" || !input.studyId.length) {
    return { ok: false, message: "ID do estudo inválido." };
  }

  try {
    const userId = await getCurrentUserId();
    const now = new Date();
    const today = toIsoDate(now);

    // Verifica se já existem agendamentos ativos para este estudo
    const existingSchedules = await db.schedule.findMany({
      where: {
        studyId: input.studyId,
        userId,
        status: "Ativo",
      },
    });

    if (existingSchedules.length > 0 && !input.force) {
      return {
        ok: false,
        message: `Este estudo já possui ${existingSchedules.length} agendamento(s) ativo(s). Deseja criar novos mesmo assim?`,
      };
    }

    // Calcula as datas de revisão
    const sessions = [
      { session: "Imediata", days: 0 },
      { session: "24 horas", days: 1 },
      { session: "3 dias", days: 3 },
      { session: "1 semana", days: 7 },
      { session: "1 mês", days: 30 },
      { session: "6 meses", days: 180 },
    ];

    const schedulesToCreate = sessions.map(({ session, days }) => {
      const reviewDate = new Date(now);
      reviewDate.setDate(reviewDate.getDate() + days);
      return {
        studyId: input.studyId,
        userId,
        reviewDate: toIsoDate(reviewDate),
        createdAt: today,
        session,
        status: "Ativo",
      };
    });

    // Cria todos os agendamentos em uma transação
    await db.schedule.createMany({
      data: schedulesToCreate,
    });

    return {
      ok: true,
      data: { count: schedulesToCreate.length, hasActive: false },
    };
  } catch (error) {
    console.error("Erro ao criar agendamentos:", error);
    return { ok: false, message: "Não foi possível criar os agendamentos." };
  }
}

/**
 * Marca um agendamento como realizado após concluir os testes.
 */
export async function completeSchedule(scheduleId: string): Promise<ActionResult<void>> {
  if (typeof scheduleId !== "string" || !scheduleId.length) {
    return { ok: false, message: "ID do agendamento inválido." };
  }

  try {
    const userId = await getCurrentUserId();
    const { count } = await db.schedule.updateMany({
      where: { id: scheduleId, userId },
      data: { status: "Realizado" },
    });

    if (!count) {
      return { ok: false, message: "Agendamento não encontrado." };
    }

    return { ok: true, data: undefined };
  } catch {
    return { ok: false, message: "Não foi possível atualizar o agendamento." };
  }
}

/**
 * Lista todos os agendamentos de um usuário, ordenados por data de revisão.
 */
export async function listUserSchedules() {
  const userId = await getCurrentUserId();

  const schedules = await db.schedule.findMany({
    where: { userId },
    select: {
      id: true,
      studyId: true,
      reviewDate: true,
      createdAt: true,
      session: true,
      status: true,
      study: {
        select: { descricao: true },
      },
    },
    orderBy: [{ reviewDate: "asc" }, { session: "asc" }],
  });

  return schedules.map((s) => ({
    id: s.id,
    studyId: s.studyId,
    studyName: s.study.descricao,
    reviewDate: s.reviewDate,
    createdAt: s.createdAt,
    session: s.session,
    status: s.status,
  }));
}

/**
 * Verifica se um estudo tem agendamentos ativos.
 */
export async function checkStudyHasActiveSchedules(studyId: string): Promise<boolean> {
  if (typeof studyId !== "string" || !studyId.length) return false;

  try {
    const userId = await getCurrentUserId();
    const count = await db.schedule.count({
      where: { studyId, userId, status: "Ativo" },
    });
    return count > 0;
  } catch {
    return false;
  }
}