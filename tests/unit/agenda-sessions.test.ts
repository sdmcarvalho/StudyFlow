process.env.TZ = "America/Sao_Paulo";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_SESSIONS, reviewDateFor } from "@/features/agenda/sessions";

beforeEach(() => {
  vi.useFakeTimers();
  // 23:30 em Brasília: em UTC já é o dia seguinte.
  vi.setSystemTime(new Date(2026, 9, 31, 23, 30));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("REVIEW_SESSIONS", () => {
  it("tem as 6 sessões de revisão, nessa ordem", () => {
    expect(REVIEW_SESSIONS).toEqual([
      { session: "Imediata", days: 0 },
      { session: "24 horas", days: 1 },
      { session: "3 dias", days: 3 },
      { session: "1 semana", days: 7 },
      { session: "1 mês", days: 30 },
      { session: "6 meses", days: 180 },
    ]);
  });
});

describe("reviewDateFor", () => {
  it("usa a data local, não a UTC (23:30 de 31/10 continua sendo 31/10)", () => {
    const now = new Date();
    expect(reviewDateFor(now, 0)).toBe("2026-10-31");
  });

  it("soma dias no calendário local", () => {
    const now = new Date();
    expect(reviewDateFor(now, 1)).toBe("2026-11-01");
    expect(reviewDateFor(now, 180)).toBe("2027-04-29");
  });

  it("não altera a data recebida", () => {
    const now = new Date();
    const before = now.getTime();
    reviewDateFor(now, 30);
    expect(now.getTime()).toBe(before);
  });
});
