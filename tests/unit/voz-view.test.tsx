import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VozView } from "@/features/voz/components/VozView";
import type { JobStatus } from "@/features/voz/jobs";
import { MSG_FEW_CELLS } from "@/features/voz/range";

const NOT_INSTALLED = "A voz não está instalada neste ambiente.";

const props = (over: Partial<Parameters<typeof VozView>[0]> = {}) => ({
  studyId: "S1",
  descricao: "Direito Civil",
  total: 10,
  installed: true,
  ...over,
});

const startInput = () => screen.getByLabelText("Célula inicial");
const endInput = () => screen.getByLabelText("Célula final");
const gravar = () => screen.getByRole("button", { name: "Gravar" });
const ler = () => screen.getByText("Ler", { selector: "a, span" });

describe("VozView: campos e validação", () => {
  it("mostra Descrição e Células somente leitura e o intervalo padrão 1 a N", () => {
    render(<VozView {...props()} />);
    const descricao = screen.getByLabelText("Descrição");
    expect(descricao).toHaveValue("Direito Civil");
    expect(descricao).toHaveAttribute("readonly");
    const celulas = screen.getByLabelText("Células");
    expect(celulas).toHaveValue("10");
    expect(celulas).toHaveAttribute("readonly");
    expect(startInput()).toHaveValue("1");
    expect(endInput()).toHaveValue("10");
    expect(startInput()).toHaveAttribute("type", "text");
    expect(startInput()).toHaveAttribute("inputmode", "numeric");
    expect(endInput()).toHaveAttribute("inputmode", "numeric");
    expect(gravar()).toBeEnabled();
  });

  it("Ler é um link para a página ler com o intervalo; Voltar ao Estudo leva ao Estudo", () => {
    render(<VozView {...props({ studyId: "a b/1" })} />);
    expect(screen.getByRole("link", { name: "Ler" })).toHaveAttribute("href", "/estudo/a%20b%2F1/voz/ler?de=1&ate=10");
    expect(screen.getByRole("link", { name: "Voltar ao Estudo" })).toHaveAttribute("href", "/estudo/a%20b%2F1");
  });

  it("digitar inicial 5 com final 3 reajusta a final para 6", async () => {
    const user = userEvent.setup();
    render(<VozView {...props()} />);
    await user.clear(endInput());
    await user.type(endInput(), "3");
    expect(endInput()).not.toHaveAttribute("aria-invalid");
    await user.clear(startInput());
    await user.type(startInput(), "5");
    expect(startInput()).toHaveValue("5");
    expect(endInput()).toHaveValue("6");
    expect(endInput()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Ler" })).toHaveAttribute("href", "/estudo/S1/voz/ler?de=5&ate=6");
  });

  it("não mexe na final quando ela continua maior que a inicial", async () => {
    const user = userEvent.setup();
    render(<VozView {...props()} />);
    await user.clear(startInput());
    await user.type(startInput(), "4");
    expect(endInput()).toHaveValue("10");
  });

  it("inicial N reajusta a final para N e mostra o erro da inicial (entre 1 e N-1)", async () => {
    const user = userEvent.setup();
    render(<VozView {...props()} />);
    await user.clear(startInput());
    await user.type(startInput(), "10");
    expect(endInput()).toHaveValue("10");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("A célula inicial deve estar entre 1 e 9.");
    expect(startInput()).toHaveAttribute("aria-invalid", "true");
    expect(startInput()).toHaveAttribute("aria-describedby", alert.id);
    expect(gravar()).toBeDisabled();
  });

  it.each([
    ["1e2", "Use um número inteiro."],
    ["2.5", "Use um número inteiro."],
    ["-1", "Use um número inteiro."],
    ["0", "A célula inicial deve estar entre 1 e 9."],
    ["", "Informe a célula inicial."],
  ])("inicial %j mostra o erro junto ao campo e desabilita Ler e Gravar", async (typed, message) => {
    const user = userEvent.setup();
    render(<VozView {...props()} />);
    await user.clear(startInput());
    if (typed) await user.type(startInput(), typed);
    expect(startInput()).toHaveValue(typed);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(startInput()).toHaveAttribute("aria-invalid", "true");
    expect(startInput()).toHaveAttribute("aria-describedby", alert.id);
    expect(gravar()).toBeDisabled();
    // Ler vira um elemento sem link, marcado como desabilitado.
    expect(screen.queryByRole("link", { name: "Ler" })).toBeNull();
    expect(ler()).toHaveAttribute("aria-disabled", "true");
    expect(ler()).not.toHaveAttribute("href");
  });

  it("final fora da faixa mostra o erro da final, sem mexer na inicial", async () => {
    const user = userEvent.setup();
    render(<VozView {...props()} />);
    await user.clear(endInput());
    await user.type(endInput(), "11");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("A célula final deve estar entre 2 e 10.");
    expect(endInput()).toHaveAttribute("aria-describedby", alert.id);
    expect(startInput()).toHaveValue("1");
    expect(gravar()).toBeDisabled();
  });

  it("final igual à inicial é recusada e não altera a inicial", async () => {
    const user = userEvent.setup();
    render(<VozView {...props()} />);
    await user.clear(startInput());
    await user.type(startInput(), "3");
    await user.clear(endInput());
    await user.type(endInput(), "3");
    expect(screen.getByRole("alert")).toHaveTextContent("A célula final deve estar entre 4 e 10.");
    expect(startInput()).toHaveValue("3");
    expect(gravar()).toBeDisabled();
  });

  it("espaços em volta do número são aceitos", async () => {
    const user = userEvent.setup();
    render(<VozView {...props()} />);
    await user.clear(startInput());
    await user.type(startInput(), " 3 ");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Ler" })).toHaveAttribute("href", "/estudo/S1/voz/ler?de=3&ate=10");
  });

  it("final inválida (texto) não é reajustada pela mudança da inicial", async () => {
    const user = userEvent.setup();
    render(<VozView {...props()} />);
    await user.clear(endInput());
    await user.type(endInput(), "abc");
    await user.clear(startInput());
    await user.type(startInput(), "2");
    expect(endInput()).toHaveValue("abc");
    expect(screen.getByRole("alert")).toHaveTextContent("Use um número inteiro.");
  });

  it("N = 1 mostra o aviso, desabilita campos e ações e oferece Voltar ao Estudo", () => {
    render(<VozView {...props({ total: 1 })} />);
    expect(screen.getByText(MSG_FEW_CELLS)).toBeVisible();
    expect(startInput()).toBeDisabled();
    expect(endInput()).toBeDisabled();
    expect(gravar()).toBeDisabled();
    expect(ler()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Voltar ao Estudo" })).toHaveAttribute("href", "/estudo/S1");
  });

  it("N = 0 também mostra o aviso", () => {
    render(<VozView {...props({ total: 0 })} />);
    expect(screen.getByText(MSG_FEW_CELLS)).toBeVisible();
    expect(gravar()).toBeDisabled();
  });

  it("N = 2 aceita o intervalo 1 a 2", () => {
    render(<VozView {...props({ total: 2 })} />);
    expect(screen.queryByText(MSG_FEW_CELLS)).toBeNull();
    expect(gravar()).toBeEnabled();
    expect(screen.getByRole("link", { name: "Ler" })).toHaveAttribute("href", "/estudo/S1/voz/ler?de=1&ate=2");
  });

  it("voz não instalada avisa e desabilita Ler e Gravar", () => {
    render(<VozView {...props({ installed: false })} />);
    expect(screen.getByText(NOT_INSTALLED)).toBeVisible();
    expect(gravar()).toBeDisabled();
    expect(ler()).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "Ler" })).toBeNull();
  });

  it("voz instalada não mostra o aviso de instalação", () => {
    render(<VozView {...props()} />);
    expect(screen.queryByText(NOT_INSTALLED)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------- Gravar

const statusOf = (state: JobStatus["state"], feitas: number, extra: Partial<JobStatus> = {}): JobStatus => ({
  id: "J1",
  mode: "gravar",
  state,
  total: 4,
  feitas,
  readyCells: Array.from({ length: feitas }, (_, i) => i + 1),
  ...extra,
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

type Call = { url: string; method: string; init?: RequestInit };
let calls: Call[];
let polls: JobStatus[];
let postResult: () => Promise<Response>;

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  calls.push({ url, method, init });
  if (method === "POST") return postResult();
  if (method === "DELETE") return json({ ok: true });
  const next = polls.length > 1 ? polls.shift()! : polls[0];
  return json(next);
});

const count = (method: string) => calls.filter((c) => c.method === method).length;

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function clickGravar() {
  await act(async () => {
    fireEvent.click(gravar());
  });
}

describe("VozView: Gravar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    polls = [statusOf("na-fila", 0)];
    postResult = () => json({ id: "J1" });
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("vai de Na fila a Gerando, com barra de progresso acessível, e termina em Pronto com Baixar MP3", async () => {
    polls = [statusOf("na-fila", 0), statusOf("gerando", 2), statusOf("pronto", 4)];
    render(<VozView {...props({ descricao: "Direito: Civil?" })} />);
    fireEvent.change(startInput(), { target: { value: "2" } });
    fireEvent.change(endInput(), { target: { value: "8" } });
    await clickGravar();

    const post = calls.find((c) => c.method === "POST")!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ studyId: "S1", start: 2, end: 8, mode: "gravar" });

    expect(screen.getByRole("status")).toHaveTextContent("Na fila");
    expect(startInput()).toBeDisabled();
    expect(endInput()).toBeDisabled();
    expect(gravar()).toBeDisabled();
    expect(ler()).toHaveAttribute("aria-disabled", "true");

    await tick(1000);
    expect(screen.getByRole("status")).toHaveTextContent("Gerando… 2 de 4 células");
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAccessibleName();

    await tick(1000);
    expect(screen.getByRole("status")).toHaveTextContent("Pronto");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    const download = screen.getByRole("link", { name: "Baixar MP3" });
    expect(download).toHaveAttribute("href", "/api/voz/jobs/J1/download");
    expect(download).toHaveAttribute("download", "Direito- Civil- - células 2 a 8.mp3");
    // Terminou: o formulário volta.
    expect(startInput()).toBeEnabled();
    expect(gravar()).toBeEnabled();
  });

  it("o nome do arquivo usa o intervalo que foi ENVIADO, mesmo se os campos mudarem depois", async () => {
    polls = [statusOf("pronto", 4)];
    render(<VozView {...props()} />);
    await clickGravar();
    await tick(0);
    fireEvent.change(startInput(), { target: { value: "3" } });
    expect(screen.getByRole("link", { name: "Baixar MP3" })).toHaveAttribute("download", "Direito Civil - células 1 a 10.mp3");
  });

  it("Cancelar chama o cancelamento (DELETE) e libera o formulário", async () => {
    polls = [statusOf("gerando", 1)];
    render(<VozView {...props()} />);
    await clickGravar();
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    await act(async () => {
      fireEvent.click(cancelar);
    });
    const del = calls.filter((c) => c.method === "DELETE");
    expect(del).toHaveLength(1);
    expect(del[0].url).toBe("/api/voz/jobs/J1");
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(gravar()).toBeEnabled();
    expect(startInput()).toBeEnabled();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("erro do servidor aparece em role=alert e libera o Gravar", async () => {
    postResult = () => json({ message: "Você já tem uma voz em andamento." }, 409);
    render(<VozView {...props()} />);
    await clickGravar();
    expect(screen.getByRole("alert")).toHaveTextContent("Você já tem uma voz em andamento.");
    expect(gravar()).toBeEnabled();
    expect(startInput()).toBeEnabled();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("tarefa que falha no meio mostra a mensagem do servidor e libera o formulário", async () => {
    polls = [statusOf("gerando", 1), statusOf("erro", 1, { message: "A geração de voz falhou." })];
    render(<VozView {...props()} />);
    await clickGravar();
    await tick(1000);
    expect(screen.getByRole("alert")).toHaveTextContent("A geração de voz falhou.");
    expect(gravar()).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Baixar MP3" })).toBeNull();
  });

  it("falha de rede mostra a mensagem em pt-BR", async () => {
    postResult = () => Promise.reject(new TypeError("Failed to fetch"));
    render(<VozView {...props()} />);
    await clickGravar();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível falar com o servidor. Tente de novo.");
    expect(gravar()).toBeEnabled();
  });

  it("clique duplo em Gravar cria uma tarefa só (dois cliques antes de o React re-renderizar)", async () => {
    render(<VozView {...props()} />);
    const button = gravar();
    // Dois cliques no mesmo instante, antes de o React re-renderizar o botão como desabilitado.
    await act(async () => {
      button.click();
      button.click();
    });
    expect(count("POST")).toBe(1);
  });

  it("desmontar a tela com a tarefa ativa cancela no servidor (DELETE keepalive)", async () => {
    polls = [statusOf("gerando", 1)];
    const { unmount } = render(<VozView {...props()} />);
    await clickGravar();
    unmount();
    const del = calls.filter((c) => c.method === "DELETE");
    expect(del).toHaveLength(1);
    expect(del[0].init?.keepalive).toBe(true);
  });

  it("erros de validação não deixam enviar", async () => {
    render(<VozView {...props()} />);
    fireEvent.change(startInput(), { target: { value: "x" } });
    expect(gravar()).toBeDisabled();
    await act(async () => {
      gravar().click();
    });
    expect(count("POST")).toBe(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Use um número inteiro.");
  });
});
