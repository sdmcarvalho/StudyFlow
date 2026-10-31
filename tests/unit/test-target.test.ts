import { describe, expect, it } from "vitest";
import { resolveTestTarget } from "@/features/cards/test-target";
import type { ScheduleRow } from "@/features/agenda/types";
import type { StudyTestSummary } from "@/features/cards/types";

const study = (studyId: string): StudyTestSummary => ({
  studyId,
  studyName: `Estudo ${studyId}`,
  lastCardCreated: null,
  lastTested: null,
  totalCards: 3,
  correctAnswers: 0,
  totalAttempts: 0,
  accuracyPercent: null,
});

const schedule = (id: string, studyId: string, status = "Ativo"): ScheduleRow => ({
  id,
  studyId,
  studyName: `Estudo ${studyId}`,
  reviewDate: "2026-11-01",
  createdAt: "2026-10-31",
  session: "24 horas",
  status,
});

const studies = [study("S1"), study("S2")];
const schedules = [schedule("A1", "S1"), schedule("A2", "S2"), schedule("A3", "S1", "Realizado")];
const none = { highlightStudyId: null, scheduleId: null };

describe("resolveTestTarget", () => {
  it("destaca o Estudo listado", () => {
    expect(resolveTestTarget({ study: "S1" }, studies, schedules)).toEqual({ highlightStudyId: "S1", scheduleId: null });
  });

  it("ignora Estudo não listado, ausente ou repetido (array)", () => {
    expect(resolveTestTarget({ study: "X" }, studies, schedules)).toEqual(none);
    expect(resolveTestTarget({}, studies, schedules)).toEqual(none);
    expect(resolveTestTarget({ study: ["S1", "S2"] }, studies, schedules)).toEqual(none);
    expect(resolveTestTarget({ study: [] }, studies, schedules)).toEqual(none);
    expect(resolveTestTarget({ study: "" }, studies, schedules)).toEqual(none);
  });

  it("aceita o agendamento Ativo do próprio Estudo", () => {
    expect(resolveTestTarget({ study: "S1", schedule: "A1" }, studies, schedules)).toEqual({
      highlightStudyId: "S1",
      scheduleId: "A1",
    });
  });

  it("ignora agendamento de outro Estudo, mas mantém o destaque", () => {
    expect(resolveTestTarget({ study: "S1", schedule: "A2" }, studies, schedules)).toEqual({
      highlightStudyId: "S1",
      scheduleId: null,
    });
  });

  it("ignora agendamento Realizado, inexistente, vazio ou array, mas mantém o destaque", () => {
    const expected = { highlightStudyId: "S1", scheduleId: null };
    expect(resolveTestTarget({ study: "S1", schedule: "A3" }, studies, schedules)).toEqual(expected);
    expect(resolveTestTarget({ study: "S1", schedule: "nao-existe" }, studies, schedules)).toEqual(expected);
    expect(resolveTestTarget({ study: "S1", schedule: "" }, studies, schedules)).toEqual(expected);
    expect(resolveTestTarget({ study: "S1", schedule: ["A1"] }, studies, schedules)).toEqual(expected);
    expect(resolveTestTarget({ study: "S1", schedule: ["A1", "A1"] }, studies, schedules)).toEqual(expected);
  });

  it("ignora o agendamento quando o Estudo não é válido", () => {
    expect(resolveTestTarget({ schedule: "A1" }, studies, schedules)).toEqual(none);
    expect(resolveTestTarget({ study: "X", schedule: "A1" }, studies, schedules)).toEqual(none);
    expect(resolveTestTarget({ study: ["S1"], schedule: "A1" }, studies, schedules)).toEqual(none);
  });

  it("não confunde propriedades herdadas com ids", () => {
    expect(resolveTestTarget({ study: "__proto__" }, studies, schedules)).toEqual(none);
    expect(resolveTestTarget({ study: "S1", schedule: "constructor" }, studies, schedules)).toEqual({
      highlightStudyId: "S1",
      scheduleId: null,
    });
  });
});
