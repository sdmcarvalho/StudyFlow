import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderMessage } from "@/features/voz/components/ReaderMessage";
import { ReaderView } from "@/features/voz/components/ReaderView";
import type { JobStatus } from "@/features/voz/jobs";
import { buildReaderCells, resolveReaderRange, type ReaderCell } from "@/features/voz/reader-cells";
import { MSG_FEW_CELLS } from "@/features/voz/range";

const NOT_INSTALLED = "A voz não está instalada neste ambiente.";

// Células 1 a 4; a 3 não tem texto para ler.
const CELLS: ReaderCell[] = [
  { n: 1, texto: "Alfa um", speakable: true },
  { n: 2, texto: "Beta dois", speakable: true },
  { n: 3, texto: "---", speakable: false },
  { n: 4, texto: "Delta quatro", speakable: true },
];

const props = (over: Partial<Parameters<typeof ReaderView>[0]> = {}) => ({
  studyId: "S1",
  descricao: "Direito Civil",
  cells: CELLS,
  installed: true,
  ...over,
});

const statusOf = (state: JobStatus["state"], readyCells: number[], extra: Partial<JobStatus> = {}): JobStatus => ({
  id: "J1",
  mode: "ler",
  state,
  total: 3,
  feitas: readyCells.length,
  readyCells,
  ...extra,
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

type Call = { url: string; method: string; init?: RequestInit };
let calls: Call[];
let polls: JobStatus[];
let postResult: () => Promise<Response>;
// Resposta das consultas de estado (GET), quando o teste quer outra que não a lista `polls`.
let getResult: (() => Promise<Response>) | null;

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  calls.push({ url, method, init });
  if (method === "POST") return postResult();
  if (method === "DELETE") return json({ ok: true });
  if (getResult) return getResult();
  const next = polls.length > 1 ? polls.shift()! : polls[0];
  return json(next);
});

const count = (method: string) => calls.filter((c) => c.method === method).length;

let playMock: ReturnType<typeof vi.spyOn>;
let pauseMock: ReturnType<typeof vi.spyOn>;
let loadMock: ReturnType<typeof vi.spyOn>;
const scrollMock = vi.fn();

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const tocar = () => screen.getByRole("button", { name: "Tocar" });
const pausar = () => screen.getByRole("button", { name: "Pausar" });
const anterior = () => screen.getByRole("button", { name: "Anterior" });
const proxima = () => screen.getByRole("button", { name: "Próxima" });
const player = () => document.querySelectorAll("audio")[0] as HTMLAudioElement;
const preloader = () => document.querySelectorAll("audio")[1] as HTMLAudioElement;
const srcOf = (audio: HTMLAudioElement) => audio.getAttribute("src");
const current = () => document.querySelector('[aria-current="true"]');
const item = (n: number) => screen.getAllByRole("listitem")[n - 1];

async function clickTocar() {
  await act(async () => {
    fireEvent.click(tocar());
  });
}

async function clickCell(n: number) {
  await act(async () => {
    fireEvent.click(item(n));
  });
}

async function endCell() {
  await act(async () => {
    fireEvent.ended(player());
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  polls = [statusOf("gerando", [])];
  postResult = () => json({ id: "J1" });
  getResult = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom não implementa mídia nem rolagem.
  playMock = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  pauseMock = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  loadMock = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  scrollMock.mockClear();
  Element.prototype.scrollIntoView = scrollMock;
});

afterEach(() => {
  // Desmonta antes de restaurar os mocks: a saída da tela pausa e solta o áudio.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe("ReaderView: células", () => {
  it("mostra todas as células do intervalo com o número e o texto renderizado", () => {
    render(<ReaderView {...props()} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(screen.getByText("Célula 1")).toBeInTheDocument();
    expect(screen.getByText("Célula 4")).toBeInTheDocument();
    expect(items[0]).toHaveTextContent("Alfa um");
    expect(items[3]).toHaveTextContent("Delta quatro");
    // Nada é pedido ao servidor só por abrir a página.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(count("POST")).toBe(0);
  });

  it("marca a célula sem texto e ela não tem botão de tocar", () => {
    render(<ReaderView {...props()} />);
    expect(item(3)).toHaveTextContent("sem texto para ler");
    expect(item(1)).not.toHaveTextContent("sem texto para ler");
    expect(screen.getByRole("button", { name: "Tocar a partir da célula 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tocar a partir da célula 3" })).toBeNull();
  });

  it("a primeira célula falável é a atual (aria-current) e só uma é", () => {
    render(<ReaderView {...props()} />);
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    expect(current()).toBe(item(1));
  });

  it("o intervalo pode começar depois da célula 1 (números reais)", () => {
    render(
      <ReaderView
        {...props({
          cells: [
            { n: 5, texto: "Cinco", speakable: true },
            { n: 6, texto: "Seis", speakable: true },
          ],
        })}
      />,
    );
    expect(screen.getByText("Célula 5")).toBeInTheDocument();
    expect(screen.getByText("Célula 6")).toBeInTheDocument();
  });

  it("Voltar leva à tela Voz do Estudo", () => {
    render(<ReaderView {...props({ studyId: "a b/1" })} />);
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/estudo/a%20b%2F1/voz");
  });

  it("voz não instalada avisa, desabilita os controles e clicar numa célula não cria tarefa", async () => {
    render(<ReaderView {...props({ installed: false })} />);
    expect(screen.getByText(NOT_INSTALLED)).toBeVisible();
    expect(tocar()).toBeDisabled();
    expect(anterior()).toBeDisabled();
    expect(proxima()).toBeDisabled();
    await clickCell(2);
    expect(count("POST")).toBe(0);
    expect(playMock).not.toHaveBeenCalled();
  });
});

describe("ReaderView: começar a tocar", () => {
  it("o primeiro Tocar cria UMA tarefa no modo ler com o intervalo e mostra 'Gerando a primeira célula…'", async () => {
    render(
      <ReaderView
        {...props({
          cells: [
            { n: 3, texto: "Três", speakable: true },
            { n: 4, texto: "Quatro", speakable: false },
            { n: 5, texto: "Cinco", speakable: true },
          ],
        })}
      />,
    );
    await clickTocar();

    expect(count("POST")).toBe(1);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/voz/jobs");
    expect(JSON.parse(post.init!.body as string)).toEqual({ studyId: "S1", start: 3, end: 5, mode: "ler" });
    expect(screen.getByRole("status")).toHaveTextContent("Gerando a primeira célula…");
    expect(pausar()).toBeInTheDocument();
    expect(playMock).not.toHaveBeenCalled();
  });

  it("clique duplo em Tocar cria uma tarefa só (dois cliques antes de o React re-renderizar)", async () => {
    render(<ReaderView {...props()} />);
    const button = tocar();
    await act(async () => {
      button.click();
      button.click();
    });
    expect(count("POST")).toBe(1);
  });

  it("assim que a primeira célula fica pronta, toca sozinha com o MP3 certo", async () => {
    render(<ReaderView {...props()} />);
    await clickTocar();
    expect(playMock).not.toHaveBeenCalled();

    polls = [statusOf("gerando", [1])];
    await tick(1000);

    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/1");
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(playMock.mock.contexts[0]).toBe(player());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(pausar()).toBeInTheDocument();
  });

  it("Pausar pausa o áudio e mantém a célula; Tocar de novo continua sem criar outra tarefa", async () => {
    polls = [statusOf("gerando", [1, 2])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    expect(playMock).toHaveBeenCalledTimes(1);

    pauseMock.mockClear();
    await act(async () => {
      fireEvent.click(pausar());
    });
    expect(pauseMock).toHaveBeenCalled();
    expect(current()).toBe(item(1));
    expect(tocar()).toBeInTheDocument();

    await clickTocar();
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/1");
    expect(count("POST")).toBe(1);
  });

  it("se o navegador recusar tocar (NotAllowedError), mostra a dica e deixa os controles usáveis", async () => {
    polls = [statusOf("gerando", [1])];
    playMock.mockRejectedValueOnce(new DOMException("bloqueado", "NotAllowedError"));
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);

    expect(screen.getByRole("status")).toHaveTextContent("Toque em Tocar para continuar.");
    expect(tocar()).toBeEnabled();
    expect(proxima()).toBeEnabled();

    // Tocar de novo funciona (a recusa foi só desta vez) e a dica some.
    await clickTocar();
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(pausar()).toBeInTheDocument();
  });
});

describe("ReaderView: célula a célula", () => {
  it("quando uma célula termina, toca a próxima com texto, pulando a que não tem", async () => {
    polls = [statusOf("gerando", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/1");

    await endCell();
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/2");
    expect(current()).toBe(item(2));

    await endCell();
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/4");
    expect(current()).toBe(item(4));
    expect(item(3)).not.toHaveAttribute("aria-current");
    expect(playMock).toHaveBeenCalledTimes(3);
  });

  it("rola a célula atual para o centro com animação suave", async () => {
    polls = [statusOf("gerando", [1, 2])];
    render(<ReaderView {...props()} />);
    expect(scrollMock).not.toHaveBeenCalled();
    await clickTocar();
    await tick(0);
    scrollMock.mockClear();

    await endCell();
    expect(scrollMock).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(scrollMock.mock.contexts.at(-1)).toBe(item(2));
  });

  it("sem scrollIntoView (jsdom) nada quebra", async () => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    render(<ReaderView {...props()} />);
    await act(async () => {
      fireEvent.click(proxima());
    });
    expect(current()).toBe(item(2));
  });

  it("se a próxima ainda não está pronta, mostra 'Gerando a próxima célula…' e retoma quando ficar", async () => {
    polls = [statusOf("gerando", [1])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    playMock.mockClear();

    await endCell();
    expect(screen.getByRole("status")).toHaveTextContent("Gerando a próxima célula…");
    expect(current()).toBe(item(2));
    expect(playMock).not.toHaveBeenCalled();

    // Fica pronta outra célula que não é a esperada: continua esperando.
    polls = [statusOf("gerando", [1, 4])];
    await tick(1000);
    expect(screen.getByRole("status")).toHaveTextContent("Gerando a próxima célula…");
    expect(playMock).not.toHaveBeenCalled();

    polls = [statusOf("gerando", [1, 4, 2])];
    await tick(1000);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/2");
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("ao terminar a última célula, para e mostra 'Fim da leitura.'; Tocar recomeça do início", async () => {
    polls = [statusOf("pronto", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    await endCell();
    await endCell();
    await endCell();

    expect(screen.getByRole("status")).toHaveTextContent("Fim da leitura.");
    expect(tocar()).toBeInTheDocument();
    expect(current()).toBe(item(4));
    expect(playMock).toHaveBeenCalledTimes(3);

    await clickTocar();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(current()).toBe(item(1));
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/1");
    expect(playMock).toHaveBeenCalledTimes(4);
    expect(count("POST")).toBe(1);
  });

  it("adianta o download da próxima célula só quando ela está pronta", async () => {
    polls = [statusOf("gerando", [1])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    expect(preloader()).not.toHaveAttribute("src");

    polls = [statusOf("gerando", [1, 2])];
    await tick(1000);
    expect(srcOf(preloader())).toBe("/api/voz/jobs/J1/cells/2");
    expect(preloader()).toHaveAttribute("preload", "auto");
    expect(playMock).toHaveBeenCalledTimes(1);
  });
});

describe("ReaderView: Anterior, Próxima e clique na célula", () => {
  it("Próxima e Anterior movem a célula atual e tocam se estava tocando", async () => {
    polls = [statusOf("gerando", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);

    await act(async () => {
      fireEvent.click(proxima());
    });
    expect(current()).toBe(item(2));
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/2");

    await act(async () => {
      fireEvent.click(proxima());
    });
    expect(current()).toBe(item(4)); // pulou a 3

    await act(async () => {
      fireEvent.click(anterior());
    });
    expect(current()).toBe(item(2));
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/2");
  });

  it("Anterior fica desabilitado na primeira e Próxima na última", async () => {
    render(<ReaderView {...props()} />);
    expect(anterior()).toBeDisabled();
    await act(async () => {
      fireEvent.click(proxima());
      fireEvent.click(proxima());
    });
    expect(current()).toBe(item(4));
    expect(proxima()).toBeDisabled();
    expect(anterior()).toBeEnabled();
  });

  it("Próxima antes de tocar só move a célula atual, sem criar tarefa nem tocar", async () => {
    render(<ReaderView {...props()} />);
    await act(async () => {
      fireEvent.click(proxima());
    });
    expect(current()).toBe(item(2));
    expect(count("POST")).toBe(0);
    expect(playMock).not.toHaveBeenCalled();
    expect(tocar()).toBeInTheDocument();
  });

  it("clicar numa célula antes de tocar cria a tarefa e toca a partir dela quando ficar pronta", async () => {
    polls = [statusOf("gerando", [1])];
    render(<ReaderView {...props()} />);
    await clickCell(4);

    expect(count("POST")).toBe(1);
    expect(current()).toBe(item(4));
    expect(screen.getByRole("status")).toHaveTextContent("Gerando a próxima célula…");
    expect(playMock).not.toHaveBeenCalled();

    polls = [statusOf("gerando", [1, 2, 4])];
    await tick(1000);
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/4");
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("clicar numa célula com a tarefa já criada pula para ela sem nova tarefa", async () => {
    polls = [statusOf("gerando", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);

    await clickCell(2);
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/2");
    expect(current()).toBe(item(2));
    expect(count("POST")).toBe(1);
  });

  it("o botão 'Tocar a partir da célula N' também toca dali", async () => {
    polls = [statusOf("gerando", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tocar a partir da célula 4" }));
    });
    await tick(0);
    expect(count("POST")).toBe(1);
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/4");
  });

  it("clicar numa célula sem texto vai para a próxima falável", async () => {
    polls = [statusOf("gerando", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await clickCell(3);
    await tick(0);
    expect(current()).toBe(item(4));
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/4");
  });

  it("com texto selecionado, 'Tocar a partir da célula N' ainda toca; clicar no corpo da célula não", async () => {
    polls = [statusOf("gerando", [1, 2, 4])];
    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "texto selecionado" } as unknown as Selection);
    render(<ReaderView {...props()} />);

    await clickCell(2);
    expect(count("POST")).toBe(0);
    expect(playMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tocar a partir da célula 4" }));
    });
    await tick(0);
    expect(count("POST")).toBe(1);
    expect(current()).toBe(item(4));
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/4");
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("clicar num link dentro da célula não toca nem cria tarefa", async () => {
    render(
      <ReaderView
        {...props({
          cells: [
            { n: 1, texto: "[o site](https://example.com)", speakable: true },
            { n: 2, texto: "Beta", speakable: true },
          ],
        })}
      />,
    );
    const link = screen.getByRole("link", { name: "o site" });
    link.addEventListener("click", (event) => event.preventDefault());
    await act(async () => {
      fireEvent.click(link);
    });
    expect(count("POST")).toBe(0);
    expect(playMock).not.toHaveBeenCalled();
  });
});

describe("ReaderView: falhas e saída", () => {
  it("tarefa com erro mostra o alerta, para o áudio e Tocar cria uma tarefa nova", async () => {
    polls = [statusOf("gerando", [1])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    expect(playMock).toHaveBeenCalledTimes(1);

    pauseMock.mockClear();
    polls = [statusOf("erro", [1], { message: "A geração de voz falhou." })];
    await tick(1000);

    expect(screen.getByRole("alert")).toHaveTextContent("A geração de voz falhou.");
    expect(pauseMock).toHaveBeenCalled();
    expect(tocar()).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Pausar" })).toBeNull();

    polls = [statusOf("gerando", [1], { id: "J2" })];
    postResult = () => json({ id: "J2" });
    await clickTocar();
    expect(count("POST")).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
    await tick(0);
    expect(srcOf(player())).toBe("/api/voz/jobs/J2/cells/1");
  });

  it("tarefa nova sem a célula atual pronta mostra 'Gerando a primeira célula…' e só toca quando ela ficar pronta", async () => {
    // A tarefa antiga tinha a célula 1 pronta; a nova ainda não.
    polls = [statusOf("gerando", [1])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    expect(playMock).toHaveBeenCalledTimes(1);

    polls = [statusOf("erro", [1], { message: "A geração de voz falhou." })];
    await tick(1000);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    polls = [statusOf("gerando", [], { id: "J2" })];
    postResult = () => json({ id: "J2" });
    await clickTocar();
    expect(count("POST")).toBe(2);
    expect(screen.getByRole("status")).toHaveTextContent("Gerando a primeira célula…");
    expect(playMock).toHaveBeenCalledTimes(1);

    polls = [statusOf("gerando", [1], { id: "J2" })];
    await tick(1000);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(srcOf(player())).toBe("/api/voz/jobs/J2/cells/1");
    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it("tarefa nova com outras células prontas mostra 'Gerando a próxima célula…' para a atual", async () => {
    polls = [statusOf("gerando", [1, 2])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    await endCell(); // agora na célula 2, pronta na tarefa antiga
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/2");
    expect(playMock).toHaveBeenCalledTimes(2);

    polls = [statusOf("erro", [1, 2], { message: "A geração de voz falhou." })];
    await tick(1000);

    polls = [statusOf("gerando", [1], { id: "J2" })];
    postResult = () => json({ id: "J2" });
    await clickTocar();
    expect(current()).toBe(item(2));
    expect(screen.getByRole("status")).toHaveTextContent("Gerando a próxima célula…");
    expect(playMock).toHaveBeenCalledTimes(2);

    polls = [statusOf("gerando", [1, 2], { id: "J2" })];
    await tick(1000);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(srcOf(player())).toBe("/api/voz/jobs/J2/cells/2");
    expect(playMock).toHaveBeenCalledTimes(3);
  });

  it("erro na criação da tarefa aparece em alerta e Tocar tenta de novo", async () => {
    postResult = () => json({ message: "A voz escolhida não está instalada. Escolha outra em Configuração." }, 503);
    render(<ReaderView {...props()} />);
    await clickTocar();
    expect(screen.getByRole("alert")).toHaveTextContent("A voz escolhida não está instalada.");
    expect(tocar()).toBeEnabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    postResult = () => json({ id: "J1" });
    await clickTocar();
    expect(count("POST")).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tarefa cancelada pelo servidor avisa e Tocar começa outra", async () => {
    polls = [statusOf("cancelado", [])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    expect(screen.getByRole("alert")).toHaveTextContent("A geração de voz foi cancelada.");
    expect(tocar()).toBeEnabled();

    polls = [statusOf("gerando", [])];
    await clickTocar();
    expect(count("POST")).toBe(2);
  });

  it("tarefa na fila (outra geração ocupa o servidor) mostra 'Na fila…' em vez de 'Gerando…'", async () => {
    polls = [statusOf("na-fila", [])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    expect(screen.getByRole("status")).toHaveTextContent("Na fila — aguardando outra geração terminar…");
    expect(pausar()).toBeInTheDocument();

    polls = [statusOf("gerando", [])];
    await tick(1000);
    expect(screen.getByRole("status")).toHaveTextContent("Gerando a primeira célula…");
    polls = [statusOf("gerando", [1])];
    await tick(1000);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("erro ao tocar com a tarefa sumida (404 na consulta): avisa, e Tocar cria outra tarefa na mesma célula", async () => {
    polls = [statusOf("pronto", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    await endCell(); // agora na célula 2
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/2");
    const getsBefore = count("GET");

    getResult = () => json({ message: "Tarefa não encontrada." }, 404);
    await act(async () => {
      fireEvent.error(player());
    });
    await tick(0);
    // Conferiu se a tarefa ainda existe.
    expect(count("GET")).toBe(getsBefore + 1);
    expect(calls.at(-1)!.url).toBe("/api/voz/jobs/J1");
    expect(screen.getByRole("status")).toHaveTextContent("A leitura expirou. Toque em Tocar para gerar de novo.");
    expect(tocar()).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Pausar" })).toBeNull();
    expect(current()).toBe(item(2));

    getResult = null;
    postResult = () => json({ id: "J2" });
    polls = [statusOf("gerando", [1], { id: "J2" })];
    playMock.mockClear();
    await clickTocar();
    expect(count("POST")).toBe(2);
    expect(current()).toBe(item(2));
    expect(screen.getByRole("status")).toHaveTextContent("Gerando a próxima célula…");
    expect(playMock).not.toHaveBeenCalled();

    polls = [statusOf("gerando", [1, 2], { id: "J2" })];
    await tick(1000);
    expect(srcOf(player())).toBe("/api/voz/jobs/J2/cells/2");
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(pausar()).toBeInTheDocument();
  });

  it("erro ao tocar com a tarefa viva (falha passageira): avisa, e Tocar recarrega o áudio e toca, sem nova tarefa", async () => {
    polls = [statusOf("pronto", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    expect(playMock).toHaveBeenCalledTimes(1);

    // O elemento fica em erro (ex.: MEDIA_ERR_NETWORK), como no navegador.
    Object.defineProperty(player(), "error", { configurable: true, get: () => ({ code: 2 }) });
    await act(async () => {
      fireEvent.error(player());
    });
    await tick(0);
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível tocar esta célula.");
    expect(tocar()).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Pausar" })).toBeNull();

    loadMock.mockClear();
    await clickTocar();
    expect(loadMock).toHaveBeenCalled();
    expect(loadMock.mock.contexts.at(-1)).toBe(player());
    expect(srcOf(player())).toBe("/api/voz/jobs/J1/cells/1");
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(count("POST")).toBe(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(pausar()).toBeInTheDocument();
  });

  it("erro ao tocar sem resposta da consulta (rede) conta como passageiro", async () => {
    polls = [statusOf("pronto", [1, 2, 4])];
    render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    getResult = () => Promise.reject(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.error(player());
    });
    await tick(0);
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível tocar esta célula.");
    getResult = null;
    await clickTocar();
    expect(count("POST")).toBe(1);
    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it("ao sair da tela pausa e solta o áudio e cancela a tarefa ativa (DELETE keepalive)", async () => {
    polls = [statusOf("gerando", [1])];
    const { unmount } = render(<ReaderView {...props()} />);
    await clickTocar();
    await tick(0);
    const audio = player();
    expect(srcOf(audio)).toBe("/api/voz/jobs/J1/cells/1");

    pauseMock.mockClear();
    unmount();
    expect(pauseMock).toHaveBeenCalled();
    expect(audio).not.toHaveAttribute("src");
    const del = calls.filter((c) => c.method === "DELETE");
    expect(del).toHaveLength(1);
    expect(del[0].url).toBe("/api/voz/jobs/J1");
    expect(del[0].init?.keepalive).toBe(true);
  });

  it("sair sem nunca tocar não cria nem cancela nada", () => {
    const { unmount } = render(<ReaderView {...props()} />);
    unmount();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ReaderMessage", () => {
  it("mostra cada mensagem como alerta e o link Voltar para a tela Voz", () => {
    render(<ReaderMessage studyId="a b/1" messages={["A célula inicial deve estar entre 1 e 9.", "Use um número inteiro."]} />);
    const alerts = screen.getAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toEqual(["A célula inicial deve estar entre 1 e 9.", "Use um número inteiro."]);
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/estudo/a%20b%2F1/voz");
    expect(screen.queryByRole("button", { name: "Tocar" })).toBeNull();
  });
});

// ------------------------------------------------------------------------- validação da página

const study = (n: number, texto = (i: number) => `Texto ${i}`) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, texto: texto(i + 1) }));

describe("buildReaderCells", () => {
  it("monta as células do intervalo com número, texto e se são faláveis", () => {
    const cells = study(5, (i) => (i === 3 ? "---" : `Texto ${i}`));
    expect(buildReaderCells(cells, 2, 4)).toEqual([
      { n: 2, texto: "Texto 2", speakable: true },
      { n: 3, texto: "---", speakable: false },
      { n: 4, texto: "Texto 4", speakable: true },
    ]);
  });

  it("vazia e só pontuação não são faláveis", () => {
    const cells = study(3, (i) => ["", "  ", "Algo"][i - 1]);
    expect(buildReaderCells(cells, 1, 3).map((c) => c.speakable)).toEqual([false, false, true]);
  });
});

describe("resolveReaderRange (searchParams da página)", () => {
  const cells = study(10);

  it("valores válidos devolvem as células de de a ate", () => {
    const result = resolveReaderRange(cells, "3", "5");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cells.map((c) => c.n)).toEqual([3, 4, 5]);
  });

  it.each([
    ["1e2", "5", "Use um número inteiro."],
    ["2.5", "5", "Use um número inteiro."],
    ["-1", "5", "Use um número inteiro."],
    ["0", "5", "A célula inicial deve estar entre 1 e 9."],
    ["10", "10", "A célula inicial deve estar entre 1 e 9."],
    ["3", "3", "A célula final deve estar entre 4 e 10."],
    ["5", "3", "A célula final deve estar entre 6 e 10."],
    ["3", "11", "A célula final deve estar entre 4 e 10."],
    ["", "5", "Informe a célula inicial."],
    [undefined, "5", "Informe a célula inicial."],
    [["1", "2"], "5", "Use um número inteiro."],
    ["3", undefined, "Informe a célula final."],
    ["3", ["5", "6"], "Use um número inteiro."],
  ])("de=%j ate=%j é recusado com a mensagem da validação, sem corrigir", (de, ate, message) => {
    const result = resolveReaderRange(cells, de, ate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.messages).toContain(message);
  });

  it("espaços em volta do número são aceitos como na tela Voz", () => {
    const result = resolveReaderRange(cells, " 3 ", " 4 ");
    expect(result.ok).toBe(true);
  });

  it("estudo com menos de 2 células mostra a mensagem uma vez só", () => {
    for (const n of [0, 1]) {
      const result = resolveReaderRange(study(n), "1", "2");
      expect(result).toEqual({ ok: false, messages: [MSG_FEW_CELLS] });
    }
  });

  it("início e fim inválidos juntos devolvem as duas mensagens", () => {
    const result = resolveReaderRange(cells, "x", "y");
    expect(result).toEqual({ ok: false, messages: ["Use um número inteiro."] });
    const result2 = resolveReaderRange(cells, "0", "99");
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.messages).toHaveLength(2);
  });
});
