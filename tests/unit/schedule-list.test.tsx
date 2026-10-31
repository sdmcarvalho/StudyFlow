import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduleList } from "@/features/agenda/components/ScheduleList";
import type { ScheduleRow } from "@/features/agenda/types";

const row = (id: string, status: string): ScheduleRow => ({
  id,
  studyId: "S1",
  studyName: `Estudo ${id}`,
  reviewDate: "2026-11-01",
  createdAt: "2026-10-31",
  session: "24 horas",
  status,
});

describe("ScheduleList", () => {
  it("mostra Fazer como link com study e schedule só para agendamentos Ativos", () => {
    render(<ScheduleList schedules={[row("A1", "Ativo"), row("A2", "Realizado")]} />);
    const links = screen.getAllByRole("link", { name: /^Fazer teste de/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Fazer teste de Estudo A1");
    expect(links[0]).toHaveAttribute("href", "/testes?study=S1&schedule=A1");
  });
});
