import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/voz/actions", () => ({ saveVoiceSettings: vi.fn() }));

import { VoiceSettingsForm } from "@/features/voz/components/VoiceSettingsForm";

const voices = [
  { id: "pt_BR-edresson-low", label: "edresson (baixa)" },
  { id: "pt_BR-faber-medium", label: "faber (média)" },
];
const initial = { voice: "pt_BR-faber-medium", speed: 1, volume: 1 };

const NETWORK = "Não foi possível falar com o servidor. Tente de novo.";
const GENERIC = "Não foi possível gerar a amostra.";

class FakeAudio {
  static instances: FakeAudio[] = [];
  static playResult: () => Promise<void> = () => Promise.resolve();
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => FakeAudio.playResult());
  pause = vi.fn();
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
}

const mp3 = () =>
  Promise.resolve(new Response(new Blob(["ID3"], { type: "audio/mpeg" }), { status: 200, headers: { "Content-Type": "audio/mpeg" } }));
const failure = (status: number, message: string) =>
  Promise.resolve(new Response(JSON.stringify({ message }), { status, headers: { "Content-Type": "application/json" } }));

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
let urlCounter: number;
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

const button = () => screen.getByRole("button", { name: "Ouvir amostra" });
const bodyOf = (call: number) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body));

beforeEach(() => {
  urlCounter = 0;
  FakeAudio.instances = [];
  FakeAudio.playResult = () => Promise.resolve();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => mp3());
  createObjectURL.mockReset();
  createObjectURL.mockImplementation(() => `blob:amostra-${++urlCounter}`);
  revokeObjectURL.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Audio", FakeAudio);
  // jsdom não implementa esses dois: guarda o original (indefinido) e devolve ao fim.
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

describe("VoiceSettingsForm: Ouvir amostra", () => {
  it("envia os valores atuais (não salvos), toca o MP3 e solta a URL ao terminar", async () => {
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    await userEvent.selectOptions(screen.getByLabelText("Voz", { selector: "select" }), "pt_BR-edresson-low");
    const speed = screen.getByLabelText("Velocidade");
    await userEvent.clear(speed);
    // A vírgula decimal é tratada por numberOrText (a mesma do Salvar); o jsdom zera "1,5" num input number.
    await userEvent.type(speed, "1.5");
    const volume = screen.getByLabelText("Volume");
    await userEvent.clear(volume);
    await userEvent.type(volume, "0.5");

    await userEvent.click(button());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/voz/amostra");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(bodyOf(0)).toEqual({ voice: "pt_BR-edresson-low", speed: 1.5, volume: 0.5 });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toBe("blob:amostra-1");
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(button()).toBeEnabled();

    act(() => FakeAudio.instances[0].onended?.());
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:amostra-1");
  });

  it("enquanto gera, o botão mostra Gerando amostra… e fica desabilitado", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(button());

    const busy = screen.getByRole("button", { name: "Gerando amostra…" });
    expect(busy).toBeDisabled();
    await act(async () => resolve(await mp3()));
    expect(screen.getByRole("button", { name: "Ouvir amostra" })).toBeEnabled();
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("erro do áudio solta a URL", async () => {
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    await userEvent.click(button());

    act(() => FakeAudio.instances[0].onerror?.());

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:amostra-1");
  });

  it.each([
    [503, "A voz escolhida não está instalada. Escolha outra em Configuração."],
    [409, "Aguarde a amostra anterior terminar."],
    [504, "A geração da amostra demorou demais."],
    [401, "Sessão expirada, entre novamente."],
    [400, "Use um valor entre 0,5 e 2,0."],
  ])("status %i mostra a mensagem do servidor em um alerta e não toca nada", async (status, message) => {
    fetchMock.mockImplementation(() => failure(status, message));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
    expect(button()).toBeEnabled();
  });

  it("falha de rede mostra a mensagem de rede", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK);
    expect(button()).toBeEnabled();
  });

  it("erro com corpo que não é JSON mostra a mensagem genérica", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("<html>502</html>", { status: 502 })));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
  });

  it("erro com JSON sem message mostra a mensagem genérica", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: false }), { status: 500 })));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
  });

  it("o erro some na tentativa seguinte", async () => {
    fetchMock.mockImplementationOnce(() => failure(503, "A voz escolhida não está instalada. Escolha outra em Configuração."));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(button());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(button());

    expect(screen.queryByRole("alert")).toBeNull();
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("velocidade fora da faixa mostra o erro do campo e não chama a API", async () => {
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    const speed = screen.getByLabelText("Velocidade");
    await userEvent.clear(speed);
    await userEvent.type(speed, "3");

    await userEvent.click(button());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Use um valor entre 0,5 e 2,0.")).toBeInTheDocument();
    expect(speed).toHaveAttribute("aria-invalid", "true");
    expect(button()).toBeEnabled();
  });

  it("volume vazio mostra o erro do campo e não chama a API", async () => {
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    await userEvent.clear(screen.getByLabelText("Volume"));

    await userEvent.click(button());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Use um valor entre 0,1 e 1,0.")).toBeInTheDocument();
    expect(screen.getByLabelText("Volume")).toHaveAttribute("aria-invalid", "true");
  });

  it("corrigir o valor e ouvir de novo limpa o erro do campo e chama a API", async () => {
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    const speed = screen.getByLabelText("Velocidade");
    await userEvent.clear(speed);
    await userEvent.type(speed, "3");
    await userEvent.click(button());
    expect(speed).toHaveAttribute("aria-invalid", "true");

    await userEvent.clear(speed);
    await userEvent.type(speed, "1.5");
    await userEvent.click(button());

    expect(speed).not.toHaveAttribute("aria-invalid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toEqual({ voice: "pt_BR-faber-medium", speed: 1.5, volume: 1 });
  });

  it("sem vozes instaladas o botão fica desabilitado e nada é pedido", async () => {
    render(<VoiceSettingsForm initial={initial} voices={[]} />);

    expect(button()).toBeDisabled();
    await userEvent.click(button());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("play() recusado (autoplay) mostra a dica e solta a URL", async () => {
    FakeAudio.playResult = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent("Toque em Ouvir amostra de novo para ouvir.");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:amostra-1");
    expect(button()).toBeEnabled();
  });

  it("clique duplo no mesmo instante faz uma requisição só", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    const ouvir = button();

    // Dois cliques antes de o React re-renderizar o botão como desabilitado.
    act(() => {
      ouvir.click();
      ouvir.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => resolve(await mp3()));
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("depois de terminar, um novo clique pede outra amostra", async () => {
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    await userEvent.click(button());
    await userEvent.click(button());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uma segunda amostra para a primeira e solta a URL dela", async () => {
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    await userEvent.click(button());
    const first = FakeAudio.instances[0];

    await userEvent.click(button());

    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:amostra-1");
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[1].play).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:amostra-2");
    // Fim tardio da primeira não solta a URL da segunda nem solta a primeira duas vezes.
    act(() => first.onended?.());
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("sair da tela durante a geração ignora a resposta tardia: sem áudio, sem URL", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<VoiceSettingsForm initial={initial} voices={voices} />);
    await userEvent.click(button());

    unmount();
    await act(async () => resolve(await mp3()));

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("sair da tela durante a geração com falha também não atualiza nada", async () => {
    let reject!: (e: unknown) => void;
    fetchMock.mockReturnValue(new Promise<Response>((_, r) => (reject = r)));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<VoiceSettingsForm initial={initial} voices={voices} />);
    await userEvent.click(button());

    unmount();
    await act(async () => reject(new TypeError("Failed to fetch")));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("sair da tela com a amostra tocando pausa e solta a URL", async () => {
    const { unmount } = render(<VoiceSettingsForm initial={initial} voices={voices} />);
    await userEvent.click(button());
    const audio = FakeAudio.instances[0];

    unmount();

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:amostra-1");
  });

  it("o botão da amostra não envia o formulário (type=button)", () => {
    render(<VoiceSettingsForm initial={initial} voices={voices} />);
    expect(button()).toHaveAttribute("type", "button");
  });
});
