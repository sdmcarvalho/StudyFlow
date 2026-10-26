import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/features/estudo/actions", () => ({ saveStudyContent: vi.fn() }));
vi.mock("@/features/estudo/queries", () => ({ getStudyDocument: vi.fn() }));
vi.mock("@/features/cards/queries", () => ({ listStudyCards: vi.fn().mockResolvedValue([]) }));

import EstudoEditorPage, { generateMetadata } from "@/app/(app)/estudo/[id]/page";
import { getStudyDocument } from "@/features/estudo/queries";

const getMock = vi.mocked(getStudyDocument);
const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

beforeEach(() => getMock.mockReset());

describe("página /estudo/[id]", () => {
  it("registro inexistente mostra Registro não encontrado com link ← Estudo", async () => {
    getMock.mockResolvedValue(null);
    render(await EstudoEditorPage(props("nao-existe")));
    expect(getMock).toHaveBeenCalledWith("nao-existe");
    expect(screen.getByRole("heading", { name: "Registro não encontrado" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Estudo" })).toHaveAttribute("href", "/estudo");
    expect(await generateMetadata(props("nao-existe"))).toEqual({ title: "Registro não encontrado · StudyFlow" });
  });

  it("registro existente abre o editor com a Descrição e as células", async () => {
    getMock.mockResolvedValue({
      id: "abc 1",
      descricao: "Física II",
      pasta: "C:\\Estudos\\Física",
      cells: [{ id: "a", texto: "olá" }],
    });
    render(await EstudoEditorPage(props("abc 1")));
    expect(getMock).toHaveBeenCalledWith("abc 1");
    expect(screen.getByRole("heading", { level: 1, name: "Física II" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Célula 1 de 1" })).toHaveTextContent("olá");
    expect(await generateMetadata(props("abc 1"))).toEqual({ title: "Física II · StudyFlow" });
  });
});
