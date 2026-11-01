"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { MarkdownView } from "@/features/estudo/editor/components/MarkdownView";
import type { ReaderCell } from "../reader-cells";
import { reducePlayback, type PlaybackEvent, type PlaybackState } from "../reader-playback";
import { useVoiceJob } from "../use-voice-job";
import styles from "./ReaderView.module.css";

const NOT_INSTALLED = "A voz não está instalada neste ambiente.";
const MSG_FIRST = "Gerando a primeira célula…";
const MSG_NEXT = "Gerando a próxima célula…";
const MSG_END = "Fim da leitura.";
const MSG_TAP = "Toque em Tocar para continuar.";
const MSG_AUDIO_FAILED = "Não foi possível tocar esta célula.";
const MSG_CANCELLED = "A geração de voz foi cancelada.";

type ReaderViewProps = {
  studyId: string;
  descricao: string;
  /** Todas as células do intervalo, em ordem (as sem texto para ler também). */
  cells: ReaderCell[];
  /** Há um motor de voz neste ambiente. */
  installed: boolean;
};

const NO_CELLS: number[] = [];
const INITIAL: PlaybackState = { index: 0, playing: false, waiting: false };

const cellUrl = (jobId: string, n: number) => `/api/voz/jobs/${encodeURIComponent(jobId)}/cells/${n}`;

/** Solta o áudio: para e esvazia a fonte (o navegador deixa de baixar). */
function release(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  try {
    audio.load();
  } catch {
    // ambiente sem suporte a mídia
  }
}

export function ReaderView({ studyId, descricao, cells, installed }: ReaderViewProps) {
  const job = useVoiceJob();
  const [stored, setPb] = useState<PlaybackState>(INITIAL);
  // Já houve uma ação do usuário (só então a tela rola até a célula atual) e o fim da leitura foi alcançado.
  const [engaged, setEngaged] = useState(false);
  const [finished, setFinished] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const playerRef = useRef<HTMLAudioElement>(null);
  const preloadRef = useRef<HTMLAudioElement>(null);
  const itemRefs = useRef(new Map<number, HTMLLIElement>());

  // Números das células com texto para ler, na ordem do intervalo.
  const order = useMemo(() => cells.filter((c) => c.speakable).map((c) => c.n), [cells]);
  const first = cells[0]?.n;
  const last = cells[cells.length - 1]?.n;

  const status = job.status;
  const readyCells = status?.readyCells ?? NO_CELLS;
  const jobState = status?.state;
  const failedState = jobState === "erro" || jobState === "cancelado";
  const failed = job.error !== null || failedState;
  // Há uma tarefa utilizável (a criação já respondeu e ela não falhou nem foi cancelada).
  const hasJob = status !== null && !failedState;
  const jobId = hasJob ? status.id : null;

  // `waiting` vem do que está pronto AGORA (derivado a cada render, sem efeito): o `waiting` guardado foi
  // calculado contra as células prontas da tarefa de então e fica velho quando a tarefa é trocada.
  const storedN: number | undefined = order[stored.index];
  const pb: PlaybackState = {
    ...stored,
    waiting: stored.playing && storedN !== undefined && !readyCells.includes(storedN),
  };

  // Depois de uma falha, o usuário vê "Tocar"; Tocar cria uma tarefa nova.
  const playing = pb.playing && !failed;
  const waiting = playing && pb.waiting;
  const currentN: number | undefined = order[pb.index];
  const canPlayNow =
    playing && !pb.waiting && jobId !== null && currentN !== undefined && readyCells.includes(currentN);
  const nextN: number | undefined = order[pb.index + 1];
  const preloadSrc = jobId !== null && nextN !== undefined && readyCells.includes(nextN) ? cellUrl(jobId, nextN) : undefined;

  const dispatch = useCallback(
    (event: PlaybackEvent) => setPb((prev) => reducePlayback(prev, event, { readyCells, order })),
    [readyCells, order],
  );

  /** Ação do usuário: marca a interação e limpa as mensagens do fim e do bloqueio do navegador. */
  function perform(event: PlaybackEvent) {
    setEngaged(true);
    setFinished(false);
    setHint(null);
    dispatch(event);
  }

  /** Cria a tarefa de leitura na primeira vez que o usuário pede para tocar (gesto que libera o áudio). */
  function ensureJob() {
    if (hasJob || first === undefined || last === undefined) return;
    void job.start({ studyId, start: first, end: last, mode: "ler" });
  }

  function handleToggle() {
    if (!installed) return;
    if (playing) {
      perform({ type: "pause" });
      return;
    }
    // Depois do fim, Tocar recomeça pela primeira célula com texto.
    perform(finished && order.length > 0 ? { type: "select", n: order[0] } : { type: "play" });
    ensureJob();
  }

  function handleSelect(n: number) {
    if (!installed) return;
    perform({ type: "select", n });
    ensureJob();
  }

  function handleCellClick(event: MouseEvent<HTMLLIElement>, n: number) {
    // Link dentro da célula segue o seu caminho; texto selecionado com o mouse não é um pedido de tocar.
    if ((event.target as HTMLElement).closest("a")) return;
    if (window.getSelection()?.toString()) return;
    handleSelect(n);
  }

  function handleEnded() {
    if (pb.index + 1 >= order.length) setFinished(true);
    dispatch({ type: "ended" });
  }

  // O MP3 da célula atual: toca quando ela está pronta; pausa em qualquer outro caso.
  useEffect(() => {
    const audio = playerRef.current;
    if (!audio) return;
    if (!canPlayNow || jobId === null || currentN === undefined) {
      audio.pause();
      return;
    }
    const src = cellUrl(jobId, currentN);
    if (audio.getAttribute("src") !== src) audio.src = src;
    const result: Promise<void> | undefined = audio.play();
    result?.catch((error: unknown) => {
      // O navegador só barra quando o gesto do usuário não vale mais; as outras falhas (ex.: troca de fonte
      // no meio) são seguidas por outra tentativa ou pelo evento de erro do áudio.
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setHint(MSG_TAP);
        setPb((prev) => ({ index: prev.index, playing: false, waiting: false }));
      }
    });
  }, [canPlayNow, jobId, currentN]);

  // A célula atual fica à vista.
  useEffect(() => {
    if (!engaged || currentN === undefined) return;
    itemRefs.current.get(currentN)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [engaged, currentN]);

  // Ao sair da tela o áudio para e é solto (a tarefa é cancelada pelo useVoiceJob).
  useEffect(() => {
    const player = playerRef.current;
    const preload = preloadRef.current;
    return () => {
      release(player);
      release(preload);
    };
  }, []);

  let statusText = "";
  if (waiting) statusText = readyCells.length === 0 ? MSG_FIRST : MSG_NEXT;
  else if (hint) statusText = hint;
  else if (finished) statusText = MSG_END;

  const errorText = job.error ?? (jobState === "cancelado" ? MSG_CANCELLED : null);
  const studyHref = `/estudo/${encodeURIComponent(studyId)}/voz`;
  const atFirst = pb.index <= 0;
  const atLast = pb.index >= order.length - 1;

  return (
    <section className={styles.panel} aria-labelledby="ler-title">
      <h2 id="ler-title" className={styles.title}>
        Ler
      </h2>

      {installed ? null : <p className={styles.notice}>{NOT_INSTALLED}</p>}

      <div className={styles.controls}>
        <Link href={studyHref} className={styles.back}>
          Voltar
        </Link>
        <Button variant="secondary" onClick={() => perform({ type: "prev" })} disabled={!installed || atFirst}>
          Anterior
        </Button>
        <Button variant="primary" onClick={handleToggle} disabled={!installed}>
          {playing ? "Pausar" : "Tocar"}
        </Button>
        <Button variant="secondary" onClick={() => perform({ type: "next" })} disabled={!installed || atLast}>
          Próxima
        </Button>
      </div>

      <div role="status" className={styles.status}>
        {statusText}
      </div>

      {errorText ? (
        <p className={styles.jobError} role="alert">
          {errorText}
        </p>
      ) : null}

      <ol className={styles.cells} aria-label={`Células de ${descricao}`}>
        {cells.map((cell) => {
          const current = cell.n === currentN;
          return (
            <li
              key={cell.n}
              ref={(element) => {
                if (element) itemRefs.current.set(cell.n, element);
                else itemRefs.current.delete(cell.n);
              }}
              aria-current={current ? "true" : undefined}
              className={`${styles.cell} ${current ? styles.current : ""} ${cell.speakable ? "" : styles.silent}`}
              onClick={(event) => handleCellClick(event, cell.n)}
            >
              <div className={styles.cellHead}>
                <span className={styles.number}>Célula {cell.n}</span>
                {cell.speakable ? (
                  <button
                    type="button"
                    className={styles.playFrom}
                    aria-label={`Tocar a partir da célula ${cell.n}`}
                    disabled={!installed}
                    onClick={(event) => {
                      // Pedido explícito: vale mesmo com texto selecionado (a guarda é só do clique no corpo).
                      event.stopPropagation();
                      handleSelect(cell.n);
                    }}
                  >
                    Tocar daqui
                  </button>
                ) : (
                  <span className={styles.silentTag}>sem texto para ler</span>
                )}
              </div>
              <MarkdownView texto={cell.texto} studyId={studyId} />
            </li>
          );
        })}
      </ol>

      {/* Um só áudio toca; o outro só adianta o download da próxima célula pronta. */}
      <audio
        ref={playerRef}
        hidden
        preload="auto"
        onEnded={handleEnded}
        onError={(event) => {
          if (!event.currentTarget.getAttribute("src")) return;
          setHint(MSG_AUDIO_FAILED);
          setPb((prev) => ({ index: prev.index, playing: false, waiting: false }));
        }}
      />
      <audio ref={preloadRef} hidden preload="auto" src={preloadSrc} />
    </section>
  );
}
