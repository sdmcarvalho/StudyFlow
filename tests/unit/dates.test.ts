import { describe, expect, it } from "vitest";
import { formatDateBR, isValidIsoDate, toIsoDate } from "@/lib/dates";

describe("formatDateBR", () => {
  it("converte YYYY-MM-DD para DD/MM/AAAA", () => {
    expect(formatDateBR("2026-10-25")).toBe("25/10/2026");
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
