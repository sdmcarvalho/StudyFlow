import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobStatus } from "@/features/voz/jobs";
import { useVoiceJob } from "@/features/voz/use-voice-job";

const INPUT = { studyId: "S1", start: 1, end: 4, mode: "gravar" as const };

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

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  polls = [statusOf("gerando", 1)];
  postResult = () => json({ id: "J1" });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useVoiceJob", () => {
  it("cria a tarefa por POST em JSON e consulta o estado a cada 1 s até ficar pronta, parando depois", async () => {
    polls = [statusOf("na-fila", 0), statusOf("gerando", 2), statusOf("pronto", 4)];
    const { result } = renderHook(() => useVoiceJob());

    let id: string | null = null;
    await act(async () => {
      id = await result.current.start(INPUT);
    });
    expect(id).toBe("J1");

    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/voz/jobs");
    expect(JSON.parse(post.init!.body as string)).toEqual(INPUT);
    expect(new Headers(post.init!.headers).get("Content-Type")).toBe("application/json");

    expect(result.current.busy).toBe(true);
    expect(result.current.status?.state).toBe("na-fila");

    await tick(1000);
    expect(result.current.status).toMatchObject({ state: "gerando", feitas: 2 });
    expect(result.current.busy).toBe(true);

    await tick(1000);
    expect(result.current.status).toMatchObject({ state: "pronto", feitas: 4 });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();

    const gets = count("GET");
    expect(calls.filter((c) => c.method === "GET").every((c) => c.url === "/api/voz/jobs/J1")).toBe(true);
    await tick(5000);
    expect(count("GET")).toBe(gets);
  });

  it("não consulta em intervalo menor que 1 s", async () => {
    const { result } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    const afterFirst = count("GET");
    await tick(900);
    expect(count("GET")).toBe(afterFirst);
    await tick(100);
    expect(count("GET")).toBe(afterFirst + 1);
  });

  it("erro do servidor na criação mostra a mensagem e libera nova tentativa", async () => {
    postResult = () => json({ message: "Você já tem uma voz em andamento." }, 409);
    const { result } = renderHook(() => useVoiceJob());
    let id: string | null = "x";
    await act(async () => {
      id = await result.current.start(INPUT);
    });
    expect(id).toBeNull();
    expect(result.current.error).toBe("Você já tem uma voz em andamento.");
    expect(result.current.busy).toBe(false);
    expect(count("GET")).toBe(0);

    postResult = () => json({ id: "J1" });
    await act(async () => {
      id = await result.current.start(INPUT);
    });
    expect(id).toBe("J1");
    expect(result.current.error).toBeNull();
  });

  it("resposta de erro sem mensagem legível vira texto genérico em pt-BR", async () => {
    postResult = () => Promise.resolve(new Response("<html>", { status: 500 }));
    const { result } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    expect(result.current.error).toBe("Não foi possível iniciar a voz.");
    expect(result.current.busy).toBe(false);
  });

  it("falha de rede ao criar mostra a mensagem de servidor inacessível", async () => {
    postResult = () => Promise.reject(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    expect(result.current.error).toBe("Não foi possível falar com o servidor. Tente de novo.");
    expect(result.current.busy).toBe(false);
  });

  it("tarefa que termina com erro expõe a mensagem do servidor e para de consultar", async () => {
    polls = [statusOf("gerando", 1), statusOf("erro", 1, { message: "A geração de voz falhou." })];
    const { result } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    await tick(1000);
    expect(result.current.status?.state).toBe("erro");
    expect(result.current.error).toBe("A geração de voz falhou.");
    expect(result.current.busy).toBe(false);
    const gets = count("GET");
    await tick(3000);
    expect(count("GET")).toBe(gets);
  });

  it("falha de rede ao consultar para tudo, avisa e pede o cancelamento da tarefa", async () => {
    const { result } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    await tick(1000);
    expect(result.current.error).toBe("Não foi possível falar com o servidor. Tente de novo.");
    expect(result.current.busy).toBe(false);
    expect(count("DELETE")).toBe(1);
    const gets = count("GET");
    await tick(3000);
    expect(count("GET")).toBe(gets);
  });

  it("cancel chama DELETE da tarefa, para de consultar e ignora resposta atrasada", async () => {
    let lateResolve!: (r: Response) => void;
    const { result } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    // A próxima consulta fica pendente; o cancelamento chega antes dela.
    fetchMock.mockImplementationOnce((url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", init });
      return new Promise<Response>((r) => (lateResolve = r));
    });
    await tick(1000);

    await act(async () => {
      await result.current.cancel();
    });
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.url).toBe("/api/voz/jobs/J1");
    expect(count("DELETE")).toBe(1);
    expect(result.current.busy).toBe(false);

    await act(async () => {
      lateResolve(new Response(JSON.stringify(statusOf("pronto", 4)), { status: 200 }));
    });
    expect(result.current.status?.state).not.toBe("pronto");
    expect(result.current.busy).toBe(false);
    const gets = count("GET");
    await tick(3000);
    expect(count("GET")).toBe(gets);
  });

  it("clique duplo em start dentro do mesmo instante cria uma tarefa só", async () => {
    const { result } = renderHook(() => useVoiceJob());
    const results: (string | null)[] = [];
    await act(async () => {
      const a = result.current.start(INPUT);
      const b = result.current.start(INPUT);
      results.push(...(await Promise.all([a, b])));
    });
    expect(count("POST")).toBe(1);
    expect(results).toEqual(["J1", null]);
  });

  it("desmontar com tarefa ativa cancela com DELETE keepalive (sem sendBeacon) e para os timers", async () => {
    const beacon = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    const { result, unmount } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    unmount();
    const del = calls.filter((c) => c.method === "DELETE");
    expect(del).toHaveLength(1);
    expect(del[0].url).toBe("/api/voz/jobs/J1");
    expect(del[0].init?.keepalive).toBe(true);
    expect(beacon).not.toHaveBeenCalled();

    const gets = count("GET");
    await tick(5000);
    expect(count("GET")).toBe(gets);
  });

  it("desmontar depois de a tarefa concluir não cancela nada", async () => {
    polls = [statusOf("pronto", 4)];
    const { result, unmount } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    await tick(1000);
    expect(result.current.status?.state).toBe("pronto");
    unmount();
    expect(count("DELETE")).toBe(0);
  });

  it("desmontar sem nenhuma tarefa não cancela nada", () => {
    const { unmount } = renderHook(() => useVoiceJob());
    unmount();
    expect(count("DELETE")).toBe(0);
  });

  it("pagehide com tarefa ativa cancela com DELETE keepalive; concluída não", async () => {
    const { result } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    window.dispatchEvent(new Event("pagehide"));
    const del = calls.filter((c) => c.method === "DELETE");
    expect(del).toHaveLength(1);
    expect(del[0].init?.keepalive).toBe(true);
  });

  it("pagehide com tarefa já concluída não cancela", async () => {
    polls = [statusOf("pronto", 4)];
    const { result } = renderHook(() => useVoiceJob());
    await act(async () => {
      await result.current.start(INPUT);
    });
    await tick(1000);
    window.dispatchEvent(new Event("pagehide"));
    expect(count("DELETE")).toBe(0);
  });

  it("desmontar enquanto a criação ainda responde cancela a tarefa que acabou de nascer", async () => {
    let finishPost!: (r: Response) => void;
    postResult = () => new Promise<Response>((r) => (finishPost = r));
    const { result, unmount } = renderHook(() => useVoiceJob());
    let started!: Promise<string | null>;
    act(() => {
      started = result.current.start(INPUT);
    });
    unmount();
    await act(async () => {
      finishPost(new Response(JSON.stringify({ id: "J9" }), { status: 200 }));
      await started;
    });
    const del = calls.filter((c) => c.method === "DELETE");
    expect(del).toHaveLength(1);
    expect(del[0].url).toBe("/api/voz/jobs/J9");
    expect(count("GET")).toBe(0);
  });
});
