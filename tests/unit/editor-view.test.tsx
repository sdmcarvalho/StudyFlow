import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

import { saveStudyContent } from "@/features/estudo/actions";
import { CONTENT_LIMIT_MESSAGE, MAX_CELL_CHARS, MAX_CELLS, type Cell } from "@/features/estudo/content-schema";
import { EditorView } from "@/features/estudo/editor/components/EditorView";
import { uploadImage } from "@/features/estudo/editor/upload";

const saveMock = vi.mocked(saveStudyContent);
const uploadMock = vi.mocked(uploadImage);

const PASTA = "C:\\Estudos\\Física";
const SAVED = { ok: true as const, data: { savedAt: "2026-10-25T10:00:00.000Z" } };

function setup(initialCells: Cell[] = [], { pasta = PASTA } = {}) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const utils = render(<EditorView studyId="S1" descricao="Física II" pasta={pasta} initialCells={initialCells} />);
  return { user, ...utils };
}

const TWO: Cell[] = [
  { id: "a", texto: "primeira" },
  { id: "b", texto: "segunda" },
];

const groups = () => screen.getAllByRole("group", { name: /^Célula \d+ de \d+$/ });
const cell = (n: number) => screen.getByRole("group", { name: new RegExp(`^Célula ${n} de \\d+$`) });

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Abre a edição da célula N (modo padrão) e devolve a textarea. */
async function edit(user: ReturnType<typeof userEvent.setup>, n: number) {
  await user.click(within(cell(n)).getByText(/./, { selector: "p" }));
  return within(cell(n)).getByRole("textbox") as HTMLTextAreaElement;
}

function type(textarea: HTMLTextAreaElement, value: string) {
  fireEvent.change(textarea, { target: { value } });
}

/** Impede o jsdom de tentar navegar quando um link não é interceptado. */
function blockNavigation() {
  const block = (event: Event) => event.preventDefault();
  window.addEventListener("click", block);
  return () => window.removeEventListener("click", block);
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "foto.png", { type: "image/png" });

// O asyncWrapper do Testing Library (usado pelo user-event) espera um setTimeout(0) e só sabe
// avançar o relógio falso do Jest: com o do Vitest ele ficaria esperando para sempre.
beforeAll(() => {
  (globalThis as { jest?: unknown }).jest = { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) };
});
afterAll(() => {
  delete (globalThis as { jest?: unknown }).jest;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 25, 10, 15));
  saveMock.mockReset();
  saveMock.mockResolvedValue(SAVED);
  uploadMock.mockReset();
  router.push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EditorView — estrutura", () => {
  it("cabeçalho com ← Estudo e a Descrição", () => {
    setup(TWO);
    expect(screen.getByRole("link", { name: "← Estudo" })).toHaveAttribute("href", "/estudo");
    expect(screen.getByRole("heading", { level: 1, name: "Física II" })).toBeInTheDocument();
  });

  it("sem células mostra uma célula vazia", () => {
    setup([]);
    expect(groups()).toHaveLength(1);
    expect(cell(1)).toHaveTextContent("Célula vazia. Clique para editar.");
  });

  it("abre e adiciona células sem crypto.randomUUID (http fora de localhost)", async () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    try {
      const { user } = setup([]);
      expect(groups()).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Adicionar célula abaixo" }));
      expect(groups()).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("com 2 células mostra as duas na ordem", () => {
    setup(TWO);
    expect(groups()).toHaveLength(2);
    expect(cell(1)).toHaveTextContent("primeira");
    expect(cell(2)).toHaveTextContent("segunda");
  });
});

describe("EditorView — células", () => {
  it("Adicionar célula abaixo cria a célula logo abaixo já em edição", async () => {
    const { user } = setup(TWO);
    await user.click(within(cell(1)).getByRole("button", { name: "Adicionar célula abaixo" }));
    expect(groups()).toHaveLength(3);
    const textarea = within(cell(2)).getByRole("textbox");
    expect(textarea).toHaveValue("");
    expect(textarea).toHaveFocus();
    expect(cell(3)).toHaveTextContent("segunda");
  });

  it("Excluir célula mostra o toast com Desfazer, e Desfazer devolve a célula na mesma posição", async () => {
    const { user } = setup([...TWO, { id: "c", texto: "terceira" }]);
    await user.click(within(cell(2)).getByRole("button", { name: "Excluir célula" }));
    expect(groups()).toHaveLength(2);
    expect(screen.getByText("Célula excluída.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(groups()).toHaveLength(3);
    expect(cell(2)).toHaveTextContent("segunda");
    expect(screen.queryByRole("button", { name: "Desfazer" })).not.toBeInTheDocument();
  });

  it("excluir a única célula deixa uma vazia; Desfazer troca a vazia pela original", async () => {
    const { user } = setup([{ id: "a", texto: "única" }]);
    await user.click(screen.getByRole("button", { name: "Excluir célula" }));
    expect(groups()).toHaveLength(1);
    expect(cell(1)).toHaveTextContent("Célula vazia");

    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(groups()).toHaveLength(1);
    expect(cell(1)).toHaveTextContent("única");
  });

  it("Desfazer não descarta o que já foi digitado na célula vazia", async () => {
    const { user } = setup([{ id: "a", texto: "única" }]);
    await user.click(screen.getByRole("button", { name: "Excluir célula" }));
    const textarea = await edit(user, 1);
    type(textarea, "novo");
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(groups()).toHaveLength(2);
    expect(cell(1)).toHaveTextContent("única");
    expect(cell(2)).toHaveTextContent("novo");
  });
});

describe("EditorView — salvamento", () => {
  it("autosave 2 s depois da edição, com as células atuais e o indicador", async () => {
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    type(textarea, "primeira editada");
    expect(screen.getByText("● Alterações não salvas")).toBeInTheDocument();

    await flush(1999);
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText("● Alterações não salvas")).toBeInTheDocument();

    await flush(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith("S1", [
      { id: "a", texto: "primeira editada" },
      { id: "b", texto: "segunda" },
    ]);
    expect(screen.getByText("Salvo às 10:15")).toBeInTheDocument();
  });

  it("um documento sem células salva a célula vazia criada na abertura no primeiro salvamento", async () => {
    const { user } = setup([]);
    const textarea = await edit(user, 1);
    type(textarea, "olá");
    await flush(2000);
    expect(saveMock).toHaveBeenCalledWith("S1", [{ id: expect.any(String), texto: "olá" }]);
  });

  it("Salvar salva na hora e mostra o toast Documento salvo.", async () => {
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    type(textarea, "x");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await flush();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Documento salvo.")).toBeInTheDocument();
  });

  it("Ctrl+S salva na hora (sem o atalho do navegador) e mostra o toast", async () => {
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    type(textarea, "x");
    const notCanceled = fireEvent.keyDown(textarea, { key: "s", ctrlKey: true });
    expect(notCanceled).toBe(false);
    await flush();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Documento salvo.")).toBeInTheDocument();
  });

  it("Ctrl+S fora da edição também salva", async () => {
    setup(TWO);
    expect(fireEvent.keyDown(document.body, { key: "S", ctrlKey: true })).toBe(false);
    await flush();
    expect(screen.getByText("Documento salvo.")).toBeInTheDocument();
  });

  it("sem toast quando o Salvar falha", async () => {
    saveMock.mockResolvedValue({ ok: false, message: "Não foi possível salvar. Tente novamente." });
    const { user } = setup(TWO);
    type(await edit(user, 1), "x");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await flush();
    expect(screen.queryByText("Documento salvo.")).not.toBeInTheDocument();
    expect(screen.getByText("Não salvo")).toBeInTheDocument();
  });

  it("sem toast quando houve alteração durante o salvamento manual (ainda há pendência)", async () => {
    let resolve!: (value: typeof SAVED) => void;
    saveMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    type(textarea, "x");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    type(textarea, "xy");
    await act(async () => resolve(SAVED));
    await flush();
    expect(screen.queryByText("Documento salvo.")).not.toBeInTheDocument();
    expect(screen.getByText("● Alterações não salvas")).toBeInTheDocument();
  });

  it.each([
    ["rejeitando", () => saveMock.mockRejectedValue(new Error("rede"))],
    ["devolvendo { ok: false }", () => saveMock.mockResolvedValue({ ok: false, message: "falhou" })],
  ])("falha (%s) mostra Tentando de novo, mantém o texto e tenta de novo em 5 s", async (_, fail) => {
    fail();
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    type(textarea, "texto digitado");
    await flush(2000);
    expect(screen.getByText("Falha ao salvar. Tentando de novo…")).toBeInTheDocument();
    expect(within(cell(1)).getByRole("textbox")).toHaveValue("texto digitado");

    saveMock.mockResolvedValue(SAVED);
    await flush(5000);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Salvo às 10:15")).toBeInTheDocument();
    expect(within(cell(1)).getByRole("textbox")).toHaveValue("texto digitado");
  });
});

const emptyCells = (n: number): Cell[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, texto: "" }));

describe("EditorView — limites do documento", () => {
  it("célula com mais de 200 000 caracteres: não chama o servidor, mostra o limite e protege a saída", async () => {
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    type(textarea, "x".repeat(MAX_CELL_CHARS + 1));
    await flush(2000);
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText(CONTENT_LIMIT_MESSAGE)).toBeInTheDocument();
    await flush(60000);
    expect(saveMock).not.toHaveBeenCalled();

    // Salvar mostra o mesmo aviso também no toast, sem chamar o servidor.
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await flush();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getAllByText(CONTENT_LIMIT_MESSAGE)).toHaveLength(2);
    expect(screen.queryByText("Documento salvo.")).not.toBeInTheDocument();

    // O aviso de sair continua ativo.
    const unblock = blockNavigation();
    try {
      await user.click(screen.getByRole("link", { name: "← Estudo" }));
    } finally {
      unblock();
    }
    expect(screen.getByRole("alertdialog", { name: "Sair sem salvar?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));

    // Voltando ao limite, o aviso some e o salvamento volta sozinho.
    // Clicar no link encerrou a edição: abre de novo para corrigir o texto.
    type(await edit(user, 1), "curto");
    await flush(2000);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith("S1", [
      { id: "a", texto: "curto" },
      { id: "b", texto: "segunda" },
    ]);
    // O indicador da barra sai do aviso (o toast do Salvar some sozinho).
    expect(within(screen.getByRole("toolbar")).queryByText(CONTENT_LIMIT_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByText(/^Salvo às \d\d:\d\d$/)).toBeInTheDocument();
  });

  it("Ctrl+S com documento fora do limite mostra o aviso no toast", async () => {
    const { user } = setup(TWO);
    type(await edit(user, 1), "x".repeat(MAX_CELL_CHARS + 1));
    fireEvent.keyDown(document.body, { key: "s", ctrlKey: true });
    await flush();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getAllByText(CONTENT_LIMIT_MESSAGE)).toHaveLength(2);
  });

  it("501 células: não salva e mostra o limite; excluir uma volta a salvar", async () => {
    const { user } = setup(emptyCells(MAX_CELLS + 1));
    type(await edit(user, 1), "a");
    await flush(2000);
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText(CONTENT_LIMIT_MESSAGE)).toBeInTheDocument();

    await user.click(within(cell(2)).getByRole("button", { name: "Excluir célula" }));
    await flush(2000);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0]![1]).toHaveLength(MAX_CELLS);
    expect(screen.queryByText(CONTENT_LIMIT_MESSAGE)).not.toBeInTheDocument();
    // 501 células no jsdom demoram a renderizar.
  }, 30_000);

  it("com 500 células o + fica desabilitado; abaixo disso, habilitado", async () => {
    const { user } = setup(emptyCells(MAX_CELLS));
    const adds = screen.getAllByRole("button", { name: "Adicionar célula abaixo" });
    expect(adds).toHaveLength(MAX_CELLS);
    for (const add of adds) expect(add).toBeDisabled();

    await user.click(within(cell(1)).getByRole("button", { name: "Excluir célula" }));
    expect(within(cell(1)).getByRole("button", { name: "Adicionar célula abaixo" })).toBeEnabled();
  }, 30_000);

  it("a textarea limita o texto a 200 000 caracteres", async () => {
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    expect(textarea).toHaveAttribute("maxLength", String(MAX_CELL_CHARS));
  });

  it("sair da tela antes dos 2 s salva o que estava pendente", async () => {
    const { user, unmount } = setup(TWO);
    type(await edit(user, 1), "editada");
    unmount();
    await flush();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith("S1", [
      { id: "a", texto: "editada" },
      { id: "b", texto: "segunda" },
    ]);
    await flush(10000);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("sair sem nada pendente não salva", async () => {
    const { unmount } = setup(TWO);
    unmount();
    await flush(5000);
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("EditorView — modos", () => {
  it("Dividida mostra textarea em todas; Preview tira textarea, alças, lixeiras e +; clicar no ativo volta ao padrão", async () => {
    const { user } = setup(TWO);
    await user.click(screen.getByRole("button", { name: "Visualização dividida" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Visualização (preview)" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrastar célula" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir célula" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar célula abaixo" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Visualização (preview)" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Arrastar célula" })).toHaveLength(2);
  });

  it("trocar para Dividida mantém a mesma textarea com o foco", async () => {
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    expect(textarea).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Visualização dividida" }));
    expect(within(cell(1)).getByRole("textbox")).toBe(textarea);
    expect(textarea).toHaveFocus();
  });

  it("voltar de Dividida para o padrão mantém em edição a célula focada", async () => {
    const { user } = setup(TWO);
    await user.click(screen.getByRole("button", { name: "Visualização dividida" }));
    await user.click(within(cell(2)).getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: "Visualização dividida" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(within(cell(2)).getByRole("textbox")).toHaveFocus();
  });
});

describe("EditorView — barra e atalhos", () => {
  it("a barra fica desabilitada fora de edição e age na célula em edição", async () => {
    const { user } = setup(TWO);
    expect(screen.getByRole("button", { name: "Negrito" })).toBeDisabled();
    const textarea = await edit(user, 1);
    textarea.setSelectionRange(0, 8);
    await user.click(screen.getByRole("button", { name: "Negrito" }));
    expect(textarea).toHaveValue("**primeira**");
    expect(textarea).toHaveFocus();
  });

  it("em Dividida a barra age sobre a última célula focada", async () => {
    const { user } = setup(TWO);
    await user.click(screen.getByRole("button", { name: "Visualização dividida" }));
    const second = within(cell(2)).getByRole("textbox") as HTMLTextAreaElement;
    await user.click(second);
    second.setSelectionRange(0, 7);
    await user.click(screen.getByRole("button", { name: "Itálico" }));
    expect(second).toHaveValue("*segunda*");
    expect(within(cell(1)).getByRole("textbox")).toHaveValue("primeira");
  });

  it("Ctrl+B e Ctrl+I formatam a seleção da célula focada", async () => {
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    textarea.setSelectionRange(0, 8);
    expect(fireEvent.keyDown(textarea, { key: "b", ctrlKey: true })).toBe(false);
    expect(textarea).toHaveValue("**primeira**");
    textarea.setSelectionRange(2, 10);
    expect(fireEvent.keyDown(textarea, { key: "i", ctrlKey: true })).toBe(false);
    expect(textarea).toHaveValue("***primeira***");
    expect(screen.getByText("● Alterações não salvas")).toBeInTheDocument();
  });

  it("Ctrl+B fora de uma célula não faz nada", () => {
    setup(TWO);
    expect(fireEvent.keyDown(document.body, { key: "b", ctrlKey: true })).toBe(true);
  });

  it("clicar (pointerdown) fora da célula e da barra encerra a edição; dentro da barra, não", async () => {
    const { user } = setup(TWO);
    await edit(user, 1);
    fireEvent.pointerDown(screen.getByRole("toolbar"));
    expect(within(cell(1)).getByRole("textbox")).toBeInTheDocument();

    // Foco na barra (teclado): a textarea já perdeu o foco, mas clicar fora ainda encerra a edição.
    screen.getByRole("button", { name: "Negrito" }).focus();
    expect(within(cell(1)).getByRole("textbox")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("heading", { level: 1 }));
    expect(within(cell(1)).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("pointerdown dentro da célula em edição não encerra a edição", async () => {
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    fireEvent.pointerDown(textarea);
    fireEvent.pointerDown(cell(1));
    expect(within(cell(1)).getByRole("textbox")).toBe(textarea);
  });
});

describe("EditorView — imagens", () => {
  it("pasta legada mostra o aviso e desabilita só o botão Imagem", async () => {
    const { user } = setup(TWO, { pasta: "Matemática" });
    expect(screen.getByText("Defina uma pasta válida para usar imagens")).toBeInTheDocument();
    const textarea = await edit(user, 1);
    expect(screen.getByRole("button", { name: "Imagem" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Negrito" })).toBeEnabled();
    type(textarea, "ok");
    await flush(2000);
    expect(saveMock).toHaveBeenCalled();
  });

  it("pasta válida: Imagem abre o diálogo e insere o Markdown na célula em edição", async () => {
    const { user } = setup(TWO);
    expect(screen.queryByText("Defina uma pasta válida para usar imagens")).not.toBeInTheDocument();
    const textarea = await edit(user, 1);
    textarea.setSelectionRange(8, 8);
    await user.click(screen.getByRole("button", { name: "Imagem" }));
    const dialog = screen.getByRole("dialog", { name: "Inserir imagem" });
    // O foco foi para o diálogo, mas a célula continua em edição.
    expect(within(cell(1)).getByRole("textbox")).toBe(textarea);

    await user.type(within(dialog).getByLabelText("Endereço da imagem"), "https://example.com/a.png");
    await user.type(within(dialog).getByLabelText("Texto alternativo"), "foto");
    await user.click(within(dialog).getByRole("button", { name: "Inserir" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(textarea).toHaveValue("primeira![foto](https://example.com/a.png)");
  });

  it("redimensionar pelo campo Largura reescreve só a imagem no texto da célula", async () => {
    const { user } = setup([{ id: "a", texto: "antes ![foto](https://example.com/a.png) depois" }]);
    await user.click(screen.getByRole("button", { name: "Visualização dividida" }));
    await user.click(screen.getByRole("img", { name: "foto" }));
    const input = screen.getByLabelText("Largura");
    await user.clear(input);
    await user.type(input, "450{Enter}");
    expect(screen.getByRole("textbox")).toHaveValue("antes ![foto|450](https://example.com/a.png) depois");
  });

  it("falha no envio ao colar mostra o toast de erro", async () => {
    uploadMock.mockResolvedValue({ ok: false, message: "Não foi possível salvar a imagem." });
    const { user } = setup(TWO);
    const textarea = await edit(user, 1);
    fireEvent.paste(textarea, { clipboardData: { files: [png()], types: ["Files"] } });
    await flush();
    expect(screen.getByText("Não foi possível salvar a imagem.")).toBeInTheDocument();
  });

  it("envio que termina depois de a célula ser excluída não cria nem altera nada", async () => {
    let resolve!: (value: { ok: true; path: string; alt: string }) => void;
    uploadMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user } = setup(TWO);
    await user.click(screen.getByRole("button", { name: "Visualização dividida" }));
    fireEvent.paste(within(cell(2)).getByRole("textbox"), {
      clipboardData: { files: [png()], types: ["Files"] },
    });
    await user.click(within(cell(2)).getByRole("button", { name: "Excluir célula" }));
    expect(groups()).toHaveLength(1);
    await flush(2000);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenLastCalledWith("S1", [{ id: "a", texto: "primeira" }]);
    expect(screen.getByText("Salvo às 10:15")).toBeInTheDocument();

    await act(async () => resolve({ ok: true, path: "imagens/foto-1.png", alt: "foto" }));
    await flush(5000);
    expect(groups()).toHaveLength(1);
    expect(screen.getByRole("textbox")).toHaveValue("primeira");
    // Nada mudou: o documento continua salvo e não houve novo salvamento.
    expect(screen.getByText("Salvo às 10:15")).toBeInTheDocument();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

describe("EditorView — sair sem salvar", () => {
  it("com alterações pendentes, clicar num link interno abre Sair sem salvar?; Continuar editando fecha", async () => {
    const { user } = setup(TWO);
    type(await edit(user, 1), "x");
    const unblock = blockNavigation();
    try {
      await user.click(screen.getByRole("link", { name: "← Estudo" }));
    } finally {
      unblock();
    }
    const dialog = screen.getByRole("alertdialog", { name: "Sair sem salvar?" });
    await user.click(within(dialog).getByRole("button", { name: "Continuar editando" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Sair sem salvar navega para o link clicado", async () => {
    const { user } = setup(TWO);
    type(await edit(user, 1), "x");
    const unblock = blockNavigation();
    try {
      await user.click(screen.getByRole("link", { name: "← Estudo" }));
    } finally {
      unblock();
    }
    await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(router.push).toHaveBeenCalledWith("/estudo");
  });

  it("sem alterações pendentes o diálogo não abre", async () => {
    const { user } = setup(TWO);
    const unblock = blockNavigation();
    try {
      await user.click(screen.getByRole("link", { name: "← Estudo" }));
    } finally {
      unblock();
    }
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
