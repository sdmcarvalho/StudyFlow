// Lógica de reprodução da tela Ler, como função pura (sem React, sem áudio, sem rede).
//
// `order` são os números das células com texto para ler, na ordem do intervalo; `index` aponta para
// uma posição dessa lista. `readyCells` são os números das células cujo MP3 já existe no servidor.
// Quem usa traduz o estado em ações: tocar o MP3 da célula `order[index]` quando `playing && !waiting`.

export type PlaybackState = {
  /** Posição em `order` da célula atual. */
  index: number;
  /** O usuário quer ouvir (inclui o tempo de espera por uma célula ainda não gerada). */
  playing: boolean;
  /** Quer ouvir, mas o MP3 da célula atual ainda não está pronto. */
  waiting: boolean;
};

export type PlaybackEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "ended" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "select"; n: number }
  | { type: "cellReady" };

export type PlaybackContext = { readyCells: number[]; order: number[] };

/** Vai para `index` mantendo `playing`; só espera se estiver tocando e a célula não estiver pronta. */
function moveTo(state: PlaybackState, index: number, playing: boolean, ctx: PlaybackContext): PlaybackState {
  const ready = ctx.readyCells.includes(ctx.order[index]);
  return { index, playing, waiting: playing && !ready };
}

export function reducePlayback(state: PlaybackState, event: PlaybackEvent, ctx: PlaybackContext): PlaybackState {
  const { order } = ctx;
  if (order.length === 0) return state;

  switch (event.type) {
    case "play":
      return moveTo(state, state.index, true, ctx);

    case "pause":
      return { index: state.index, playing: false, waiting: false };

    case "ended": {
      // Fim da lista: para na última célula.
      if (state.index + 1 >= order.length) return { index: state.index, playing: false, waiting: false };
      return moveTo(state, state.index + 1, true, ctx);
    }

    case "next":
      return state.index + 1 < order.length ? moveTo(state, state.index + 1, state.playing, ctx) : state;

    case "prev":
      return state.index > 0 ? moveTo(state, state.index - 1, state.playing, ctx) : state;

    case "select": {
      if (!Number.isInteger(event.n) || event.n < 1) return state;
      // A própria célula, ou — se não tem texto — a próxima falável.
      const index = order.findIndex((n) => n >= event.n);
      return index === -1 ? state : moveTo(state, index, true, ctx);
    }

    case "cellReady":
      // Só retoma a espera quando é a célula esperada que ficou pronta.
      if (state.playing && state.waiting && ctx.readyCells.includes(order[state.index])) {
        return { ...state, waiting: false };
      }
      return state;
  }
}
