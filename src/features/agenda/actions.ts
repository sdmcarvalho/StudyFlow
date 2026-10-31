"use server";
import { authActionMessage } from "@/lib/auth-response";
import { getCurrentUserId, isAuthError } from "@/lib/current-user";
import { db } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";
import { REVIEW_SESSIONS, reviewDateFor } from "./sessions";

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

    // O id do estudo vem do cliente: só vale se for um Estudo ativo do próprio usuário. Sem isso, os
    // agendamentos ficariam presos ao Estudo de outra pessoa e a agenda exibiria o nome dele.
    const study = await db.studyRecord.findFirst({
      where: { id: input.studyId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!study) return { ok: false, message: "Estudo não encontrado." };

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
    const schedulesToCreate = REVIEW_SESSIONS.map(({ session, days }) => ({
      studyId: input.studyId,
      userId,
      reviewDate: reviewDateFor(now, days),
      createdAt: today,
      session,
      status: "Ativo",
    }));

    // Cria todos os agendamentos em uma transação
    await db.schedule.createMany({
      data: schedulesToCreate,
    });

    return {
      ok: true,
      data: { count: schedulesToCreate.length, hasActive: false },
    };
  } catch (error) {
    const authMessage = authActionMessage(error);
    if (authMessage) return { ok: false, message: authMessage };
    console.error("Erro ao criar agendamentos:", error);
    return { ok: false, message: "Não foi possível criar os agendamentos." };
  }
}

/**
 * Marca um agendamento como realizado após concluir os testes. Só vale para agendamentos "Ativo":
 * concluir um que já está "Realizado" devolve "não encontrado" e não altera nada.
 */
export async function completeSchedule(scheduleId: string): Promise<ActionResult<void>> {
  if (typeof scheduleId !== "string" || !scheduleId.length) {
    return { ok: false, message: "ID do agendamento inválido." };
  }

  try {
    const userId = await getCurrentUserId();
    const { count } = await db.schedule.updateMany({
      where: { id: scheduleId, userId, status: "Ativo" },
      data: { status: "Realizado" },
    });

    if (!count) {
      return { ok: false, message: "Agendamento não encontrado." };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    const authMessage = authActionMessage(error);
    if (authMessage) return { ok: false, message: authMessage };
    return { ok: false, message: "Não foi possível atualizar o agendamento." };
  }
}

/**
 * Exclui de vez um agendamento do usuário, Ativo ou Realizado. Não há exclusão lógica: o registro é só
 * um lembrete de revisão e nada mais aponta para ele.
 */
export async function deleteSchedule(scheduleId: string): Promise<ActionResult<void>> {
  if (typeof scheduleId !== "string" || !scheduleId.length) {
    return { ok: false, message: "ID do agendamento inválido." };
  }

  try {
    const userId = await getCurrentUserId();
    const { count } = await db.schedule.deleteMany({ where: { id: scheduleId, userId } });

    if (!count) {
      return { ok: false, message: "Agendamento não encontrado." };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    const authMessage = authActionMessage(error);
    if (authMessage) return { ok: false, message: authMessage };
    console.error("Erro ao excluir agendamento:", error);
    return { ok: false, message: "Não foi possível excluir o agendamento." };
  }
}

/**
 * Lista todos os agendamentos de um usuário, ordenados por data de revisão.
 * Sem sessão válida lança AuthError (a página já redirecionou para o login antes de chamar).
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
 * Verifica se um estudo tem agendamentos ativos. Sem sessão válida lança AuthError (não é "false").
 */
export async function checkStudyHasActiveSchedules(studyId: string): Promise<boolean> {
  if (typeof studyId !== "string" || !studyId.length) return false;

  try {
    const userId = await getCurrentUserId();
    const count = await db.schedule.count({
      where: { studyId, userId, status: "Ativo" },
    });
    return count > 0;
  } catch (error) {
    if (isAuthError(error)) throw error;
    return false;
  }
}