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

describe("EditorView: botão Resumir (casos extremos)", () => {
  it("se a chamada da IA lançar erro, avisa e o botão volta a funcionar", async () => {
    summarizeMock.mockRejectedValueOnce(new Error("falha de rede"));
    const user = setup();
    await edit(user, 1);

    await user.click(summarizeButton());
    await flush();

    expect(screen.getByText("Não foi possível usar a IA. Tente novamente.")).toBeInTheDocument();
    expect(groups()).toHaveLength(2);
    expect(screen.queryByText("Resumindo…")).not.toBeInTheDocument();
    expect(summarizeButton()).toBeEnabled();

    await user.click(summarizeButton());
    await flush();
    expect(groups()).toHaveLength(3);
    expect(cell(2)).toHaveTextContent("Resumo gerado.");
  });

  it("se o limite de células for atingido durante a espera, mostra o aviso e não cria a célula", async () => {
    let finish: (value: { ok: true; text: string }) => void = () => {};
    summarizeMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const cells = Array.from({ length: MAX_CELLS - 1 }, (_, i): Cell => ({ id: `c${i}`, texto: `texto ${i}` }));
    const user = setup(cells);
    await edit(user, 1);

    await user.click(summarizeButton());
    expect(screen.getByText("Resumindo…")).toBeInTheDocument();

    // Enquanto a IA trabalha, o usuário ocupa a última vaga.
    await user.click(within(cell(1)).getByRole("button", { name: "Adicionar célula abaixo" }));
    expect(groups()).toHaveLength(MAX_CELLS);

    await act(async () => finish({ ok: true, text: "Resumo gerado." }));

    expect(screen.getByText(/limite de células/i)).toBeInTheDocument();
    expect(groups()).toHaveLength(MAX_CELLS);
    expect(screen.queryByText("Resumo gerado.")).not.toBeInTheDocument();
    expect(screen.queryByText("Resumindo…")).not.toBeInTheDocument();
  }, 60_000);

  it("anuncia 'Resumindo…' numa região viva que existe sempre e só tem texto enquanto resume", async () => {
    let finish: (value: { ok: true; text: string }) => void = () => {};
    summarizeMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = setup();
    await edit(user, 1);

    const live = () => screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite" && el.closest('[role="toolbar"]') && el.previousElementSibling === summarizeButton());
    expect(live()).toBeDefined();
    expect(live()).toHaveTextContent("");
    expect(summarizeButton()).toHaveAttribute("title", "Resumir a célula atual com IA");

    await user.click(summarizeButton());
    expect(live()).toHaveTextContent("Resumindo…");
    expect(summarizeButton()).toHaveAttribute("title", "Resumindo…");

    await act(async () => finish({ ok: true, text: "Resumo gerado." }));
    expect(live()).toBeDefined();
    expect(live()).toHaveTextContent("");
  });
});
