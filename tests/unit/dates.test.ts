process.env.TZ = "America/Sao_Paulo";

import { describe, expect, it } from "vitest";
import { formatDateBR, formatDateTimeBR, isValidIsoDate, toIsoDate } from "@/lib/dates";

describe("formatDateBR", () => {
  it("converte YYYY-MM-DD para DD/MM/AAAA", () => {
    expect(formatDateBR("2026-10-25")).toBe("25/10/2026");
  });
});

describe("formatDateTimeBR", () => {
  it("mostra a data local de um instante ISO completo (toISOString)", () => {
    expect(formatDateTimeBR(new Date(2026, 8, 10, 12, 0).toISOString())).toBe("10/09/2026");
  });

  it("usa o dia local, não o dia UTC, perto da meia-noite", () => {
    // 23:30 em Brasília já é o dia seguinte em UTC.
    expect(formatDateTimeBR(new Date(2026, 9, 31, 23, 30).toISOString())).toBe("31/10/2026");
  });

  it.each(["", "lixo", "2026-13-45T99:00:00Z"])("devolve — para %j sem lançar erro", (value) => {
    expect(formatDateTimeBR(value)).toBe("—");
  });
});

describe("toIsoDate", () => {
  it("usa a data local, com zero à esquerda", () => {
    expect(toIsoDate(new Date(2026, 9, 5))).toBe("2026-10-05");
  });
});

describe("isValidIsoDate", () => {
  it.each(["2026-02-28", "2024-02-29"])("aceita %s", (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  it.each(["2026-02-30", "2026-02-29", "2026-13-01", "", "2026-2-3", "04/08/2026"])(
    "rejeita %j",
    (value) => {
      expect(isValidIsoDate(value)).toBe(false);
    },
  );
});
