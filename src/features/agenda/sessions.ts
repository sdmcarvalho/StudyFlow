import { toIsoDate } from "@/lib/dates";

// Módulo puro (sem "use server"): as constantes e a conta de datas são usadas tanto pela action que
// grava os agendamentos quanto pelo modal que mostra a prévia, para os dois nunca divergirem.
export const REVIEW_SESSIONS: ReadonlyArray<{ session: string; days: number }> = [
  { session: "Imediata", days: 0 },
  { session: "24 horas", days: 1 },
  { session: "3 dias", days: 3 },
  { session: "1 semana", days: 7 },
  { session: "1 mês", days: 30 },
  { session: "6 meses", days: 180 },
];

/** Data local (YYYY-MM-DD) de uma revisão `days` dias depois de `now`, somando no calendário local. */
export function reviewDateFor(now: Date, days: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}
