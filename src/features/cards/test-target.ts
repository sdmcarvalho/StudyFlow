import type { ScheduleRow } from "@/features/agenda/types";
import type { StudyTestSummary } from "./types";

type TestTargetParams = { study?: string | string[]; schedule?: string | string[] };

/**
 * Resolve `?study=&schedule=` de /testes. Os parâmetros vêm da URL (forjáveis): o Estudo só vale se
 * estiver na lista do usuário e o agendamento só vale se for um agendamento Ativo desse mesmo Estudo.
 */
export function resolveTestTarget(
  params: TestTargetParams,
  studies: StudyTestSummary[],
  schedules: ScheduleRow[],
): { highlightStudyId: string | null; scheduleId: string | null } {
  const study = typeof params.study === "string" ? params.study : "";
  if (!study || !studies.some((item) => item.studyId === study)) return { highlightStudyId: null, scheduleId: null };

  const schedule = typeof params.schedule === "string" ? params.schedule : "";
  const valid =
    schedule !== "" && schedules.some((item) => item.id === schedule && item.studyId === study && item.status === "Ativo");
  return { highlightStudyId: study, scheduleId: valid ? schedule : null };
}
