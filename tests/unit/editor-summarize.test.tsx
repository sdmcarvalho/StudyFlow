import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/estudo/S1" }));
vi.mock("@/features/estudo/actions", () => ({ saveStudyContent: vi.fn() }));
vi.mock("@/features/estudo/editor/upload", () => ({
  UPLOAD_FAILED: "Não foi possível salvar a imagem.",
  uploadImage: vi.fn(),
}));
vi.mock("@/features/cards/queries", () => ({ listStudyCards: vi.fn().mockResolvedValue([]) }));
vi.mock("@/features/ai/actions", () => ({ summarizeText: vi.fn() }));

import { summarizeText } from "@/features/ai/actions";
import { saveStudyContent } from "@/features/estudo/actions";
import { MAX_CELLS, type Cell } from "@/features/estudo/content-schema";
import { EditorView } from "@/features/estudo/editor/components/EditorView";

const summarizeMock = vi.mocked(summarizeText);
const saveMock = vi.mocked(saveStudyContent);

const TWO: Cell[] = [
  { id: "a", texto: "primeira" },
  { id: "b", texto: "segunda" },
];

function setup(initialCells: Cell[] = TWO) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<EditorView studyId="S1" descricao="Física II" pasta="C:\\Estudos\\Física" initialCells={initialCells} />);
  return user;
}

const groups = () => screen.getAllByRole("group", { name: /^Célula \d+ de \d+$/ });
const cell = (n: number) => screen.getByRole("group", { name: new RegExp(`^Célula ${n} de \\d+$`) });
const summarizeButton = () => screen.getByRole("button", { name: "Resumir" });

async function edit(user: ReturnType<typeof userEvent.setup>, n: number) {
  await user.click(within(cell(n)).getByText(/./, { selector: "p" }));
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeAll(() => {
  (globalThis as { jest?: unknown }).jest = { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) };
});
afterAll(() => {
  delete (globalThis as { jest?: unknown }).jest;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 26, 10, 0));
  summarizeMock.mockReset();
  summarizeMock.mockResolvedValue({ ok: true, text: "Resumo gerado." });
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true, data: { savedAt: "2026-10-26T10:00:00.000Z" } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EditorView: botão Resumir", () => {
  it("fica desabilitado até haver uma célula atual (em edição ou focada)", async () => {
    const user = setup();
    expect(summarizeButton()).toBeDisabled();

    await edit(user, 1);
    expect(summarizeButton()).toBeEnabled();
  });

  it("resume o texto da célula atual e cria a célula com o resumo logo abaixo dela", async () => {
    const user = setup();
    await edit(user, 1);

    await user.click(summarizeButton());
    await flush();

    expect(summarizeMock).toHaveBeenCalledWith("primeira");
    expect(groups()).toHaveLength(3);
    expect(cell(1)).toHaveTextContent("primeira");
    expect(cell(2)).toHaveTextContent("Resumo gerado.");
    expect(cell(3)).toHaveTextContent("segunda");
    expect(screen.getByText("Resumo criado abaixo da célula.")).toBeInTheDocument();
  });

  it("salva o documento com a célula do resumo pelo autosave", async () => {
    const user = setup();
    await edit(user, 1);

    await user.click(summarizeButton());
    await flush(2000);

    expect(saveMock).toHaveBeenCalledTimes(1);
    const saved = saveMock.mock.calls[0]![1] as Cell[];
    expect(saved.map((c) => c.texto)).toEqual(["primeira", "Resumo gerado.", "segunda"]);
  });

  it("desabilita o botão e mostra 'Resumindo…' enquanto a IA trabalha", async () => {
    let finish: (value: { ok: true; text: string }) => void = () => {};
    summarizeMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = setup();
    await edit(user, 1);

    await user.click(summarizeButton());

    expect(screen.getByRole("button", { name: "Resumir" })).toBeDisabled();
    expect(screen.getByText("Resumindo…")).toBeInTheDocument();
    expect(groups()).toHaveLength(2); // a célula só nasce quando o resumo chega

    await act(async () => finish({ ok: true, text: "Resumo gerado." }));
    expect(groups()).toHaveLength(3);
    expect(screen.queryByText("Resumindo…")).not.toBeInTheDocument();
  });

  it("mostra o erro da IA e não cria célula", async () => {
    summarizeMock.mockResolvedValue({ ok: false, message: "HTTP 401: chave inválida" });
    const user = setup();
    await edit(user, 1);

    await user.click(summarizeButton());
    await flush();

    expect(screen.getByText("HTTP 401: chave inválida")).toBeInTheDocument();
    expect(groups()).toHaveLength(2);
  });

  it("avisa que a célula está vazia sem chamar a IA", async () => {
    const user = setup([{ id: "a", texto: "   " }]);
    await edit(user, 1);

    await user.click(summarizeButton());
    await flush();

    expect(summarizeMock).not.toHaveBeenCalled();
    expect(screen.getByText("A célula está vazia.")).toBeInTheDocument();
    expect(groups()).toHaveLength(1);
  });

  it("descarta o resumo se a célula foi excluída enquanto a IA trabalhava", async () => {
    let finish: (value: { ok: true; text: string }) => void = () => {};
    summarizeMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = setup();
    await edit(user, 1);
    await user.click(summarizeButton());

    await user.click(within(cell(1)).getByRole("button", { name: "Excluir célula" }));
    await act(async () => finish({ ok: true, text: "Resumo gerado." }));

    expect(screen.getByText("A célula foi excluída; o resumo foi descartado.")).toBeInTheDocument();
    expect(groups()).toHaveLength(1);
    expect(cell(1)).toHaveTextContent("segunda");
  });

  it("avisa quando o documento já está no limite de células", async () => {
    const cells = Array.from({ length: MAX_CELLS }, (_, i): Cell => ({ id: `c${i}`, texto: `texto ${i}` }));
    const user = setup(cells);
    await edit(user, 1);

    await user.click(summarizeButton());
    await flush();

    expect(screen.getByText(/limite de células/i)).toBeInTheDocument();
    expect(groups()).toHaveLength(MAX_CELLS);
  }, 30_000);
});
