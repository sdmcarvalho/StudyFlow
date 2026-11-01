import { describe, expect, it } from "vitest";
import { reducePlayback, type PlaybackState } from "@/features/voz/reader-playback";

// Células 1..6 no intervalo; a 3 e a 5 não têm texto para ler, então a ordem de leitura é 1, 2, 4, 6.
const ORDER = [1, 2, 4, 6];
const idle: PlaybackState = { index: 0, playing: false, waiting: false };
const at = (index: number, over: Partial<PlaybackState> = {}): PlaybackState => ({
  index,
  playing: false,
  waiting: false,
  ...over,
});
const ctx = (readyCells: number[], order = ORDER) => ({ readyCells, order });

describe("reducePlayback: play e pause", () => {
  it("play com a célula atual pronta toca sem esperar", () => {
    expect(reducePlayback(idle, { type: "play" }, ctx([1]))).toEqual({ index: 0, playing: true, waiting: false });
  });

  it("play com a célula atual ainda não pronta fica esperando", () => {
    expect(reducePlayback(idle, { type: "play" }, ctx([]))).toEqual({ index: 0, playing: true, waiting: true });
    // Outra célula pronta não conta: é a atual que importa.
    expect(reducePlayback(at(1), { type: "play" }, ctx([1]))).toEqual({ index: 1, playing: true, waiting: true });
  });

  it("pause mantém o índice e encerra a espera", () => {
    expect(reducePlayback(at(2, { playing: true }), { type: "pause" }, ctx([1, 2, 4]))).toEqual({
      index: 2,
      playing: false,
      waiting: false,
    });
    expect(reducePlayback(at(2, { playing: true, waiting: true }), { type: "pause" }, ctx([1, 2]))).toEqual({
      index: 2,
      playing: false,
      waiting: false,
    });
  });

  it("sem células falantes nada acontece", () => {
    expect(reducePlayback(idle, { type: "play" }, ctx([], []))).toEqual(idle);
    expect(reducePlayback(idle, { type: "next" }, ctx([], []))).toEqual(idle);
    expect(reducePlayback(idle, { type: "select", n: 1 }, ctx([], []))).toEqual(idle);
  });
});

describe("reducePlayback: ended", () => {
  it("avança para a próxima célula falável (pula a que não tem texto) quando ela está pronta", () => {
    const state = at(1, { playing: true }); // célula 2
    expect(reducePlayback(state, { type: "ended" }, ctx([1, 2, 4]))).toEqual({
      index: 2, // célula 4, não a 3
      playing: true,
      waiting: false,
    });
  });

  it("se a próxima ainda não está pronta, espera", () => {
    const state = at(1, { playing: true });
    expect(reducePlayback(state, { type: "ended" }, ctx([1, 2]))).toEqual({ index: 2, playing: true, waiting: true });
  });

  it("no fim da lista para e mantém o índice", () => {
    const state = at(3, { playing: true });
    expect(reducePlayback(state, { type: "ended" }, ctx([1, 2, 4, 6]))).toEqual({
      index: 3,
      playing: false,
      waiting: false,
    });
  });
});

describe("reducePlayback: cellReady", () => {
  it("retoma quando a célula esperada fica pronta", () => {
    const waiting = at(2, { playing: true, waiting: true });
    expect(reducePlayback(waiting, { type: "cellReady" }, ctx([1, 2, 4]))).toEqual({
      index: 2,
      playing: true,
      waiting: false,
    });
  });

  it("não retoma quando fica pronta outra célula (a esperada continua sem áudio)", () => {
    const waiting = at(2, { playing: true, waiting: true });
    // A 6 ficou pronta antes da 4 (ordem de prontidão qualquer): não é a esperada.
    expect(reducePlayback(waiting, { type: "cellReady" }, ctx([1, 2, 6]))).toEqual(waiting);
  });

  it("sem espera ou pausado não muda nada", () => {
    expect(reducePlayback(at(0, { playing: true }), { type: "cellReady" }, ctx([1]))).toEqual(
      at(0, { playing: true }),
    );
    expect(reducePlayback(idle, { type: "cellReady" }, ctx([1]))).toEqual(idle);
  });
});

describe("reducePlayback: next e prev", () => {
  it("next vai para a próxima falável e mantém o estado de tocar", () => {
    expect(reducePlayback(at(1), { type: "next" }, ctx([1, 2, 4]))).toEqual({ index: 2, playing: false, waiting: false });
    expect(reducePlayback(at(1, { playing: true }), { type: "next" }, ctx([1, 2, 4]))).toEqual({
      index: 2,
      playing: true,
      waiting: false,
    });
  });

  it("next tocando para uma célula não pronta espera; pausado nunca espera", () => {
    expect(reducePlayback(at(1, { playing: true }), { type: "next" }, ctx([1, 2]))).toEqual({
      index: 2,
      playing: true,
      waiting: true,
    });
    expect(reducePlayback(at(1), { type: "next" }, ctx([1, 2]))).toEqual({ index: 2, playing: false, waiting: false });
  });

  it("next na última fica onde está", () => {
    const last = at(3, { playing: true });
    expect(reducePlayback(last, { type: "next" }, ctx([1, 2, 4, 6]))).toEqual(last);
  });

  it("prev volta uma falável; na primeira fica", () => {
    expect(reducePlayback(at(2, { playing: true }), { type: "prev" }, ctx([1, 2, 4]))).toEqual({
      index: 1,
      playing: true,
      waiting: false,
    });
    const first = at(0, { playing: true });
    expect(reducePlayback(first, { type: "prev" }, ctx([1]))).toEqual(first);
    expect(reducePlayback(idle, { type: "prev" }, ctx([]))).toEqual(idle);
  });

  it("prev tocando para uma célula não pronta espera", () => {
    expect(reducePlayback(at(2, { playing: true }), { type: "prev" }, ctx([4]))).toEqual({
      index: 1,
      playing: true,
      waiting: true,
    });
  });
});

describe("reducePlayback: select", () => {
  it("seleciona a célula e começa a tocar (pronta)", () => {
    expect(reducePlayback(idle, { type: "select", n: 4 }, ctx([1, 2, 4]))).toEqual({
      index: 2,
      playing: true,
      waiting: false,
    });
  });

  it("seleciona uma célula ainda não pronta e espera", () => {
    expect(reducePlayback(idle, { type: "select", n: 6 }, ctx([1, 2]))).toEqual({
      index: 3,
      playing: true,
      waiting: true,
    });
  });

  it("célula sem texto leva à seguinte falável", () => {
    expect(reducePlayback(idle, { type: "select", n: 3 }, ctx([1, 2, 4]))).toEqual({
      index: 2, // célula 4
      playing: true,
      waiting: false,
    });
    expect(reducePlayback(at(3), { type: "select", n: 5 }, ctx([6]))).toEqual({ index: 3, playing: true, waiting: false });
  });

  it("célula sem texto antes da primeira falável leva à primeira", () => {
    expect(reducePlayback(at(2), { type: "select", n: 1 }, { readyCells: [1], order: [2, 3] })).toEqual({
      index: 0,
      playing: true,
      waiting: true,
    });
  });

  it("célula desconhecida (fora do intervalo ou inválida) não muda nada", () => {
    const state = at(1, { playing: true });
    expect(reducePlayback(state, { type: "select", n: 7 }, ctx([1, 2, 4, 6]))).toEqual(state);
    expect(reducePlayback(state, { type: "select", n: 0 }, ctx([1, 2, 4, 6]))).toEqual(state);
    expect(reducePlayback(state, { type: "select", n: -2 }, ctx([1, 2, 4, 6]))).toEqual(state);
    expect(reducePlayback(state, { type: "select", n: 2.5 }, ctx([1, 2, 4, 6]))).toEqual(state);
    expect(reducePlayback(state, { type: "select", n: Number.NaN }, ctx([1, 2, 4, 6]))).toEqual(state);
  });
});

describe("reducePlayback: pureza", () => {
  it("não altera o estado nem o contexto recebidos", () => {
    const state = Object.freeze(at(1, { playing: true }));
    const readyCells = Object.freeze([1, 2]) as number[];
    const order = Object.freeze([...ORDER]) as number[];
    const events = [
      { type: "play" },
      { type: "pause" },
      { type: "ended" },
      { type: "next" },
      { type: "prev" },
      { type: "select", n: 4 },
      { type: "cellReady" },
    ] as const;
    for (const event of events) {
      const before = JSON.stringify(state);
      const result = reducePlayback(state, event, { readyCells, order });
      expect(JSON.stringify(state)).toBe(before);
      expect(result).not.toBe(undefined);
    }
    expect(readyCells).toEqual([1, 2]);
    expect(order).toEqual(ORDER);
  });
});
