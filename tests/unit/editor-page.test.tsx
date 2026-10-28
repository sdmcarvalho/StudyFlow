import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/features/estudo/actions", () => ({ saveStudyContent: vi.fn() }));
vi.mock("@/features/estudo/queries", () => ({ getStudyDocument: vi.fn() }));
vi.mock("@/features/cards/queries", () => ({ listStudyCards: vi.fn().mockResolvedValue([]) }));
// A página confere a sessão: aqui o usuário já está logado (a conferência real é testada em current-user.test.ts).
const { loggedUser } = vi.hoisted(() => ({
  loggedUser: { id: "u1", name: "Ana", email: "ana@x.com", role: "USER", folderName: "ana" },
}));
vi.mock("@/lib/current-user", () => ({
  requireUser: vi.fn().mockResolvedValue(loggedUser),
  getCurrentUser: vi.fn().mockResolvedValue(loggedUser),
}));

import EstudoEditorPage, { generateMetadata } from "@/app/(app)/estudo/[id]/page";
import { getStudyDocument } from "@/features/estudo/queries";
import { getCurrentUser, requireUser } from "@/lib/current-user";

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

  it("a página exige sessão antes de ler o registro", async () => {
    getMock.mockResolvedValue(null);
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(EstudoEditorPage(props("abc"))).rejects.toThrow("NEXT_REDIRECT");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("generateMetadata sem sessão devolve só StudyFlow sem ler o documento, e erros de banco continuam subindo", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    expect(await generateMetadata(props("abc"))).toEqual({ title: "StudyFlow" });
    expect(getMock).not.toHaveBeenCalled();
    getMock.mockRejectedValueOnce(new Error("falha do banco"));
    await expect(generateMetadata(props("abc"))).rejects.toThrow("falha do banco");
  });
});
