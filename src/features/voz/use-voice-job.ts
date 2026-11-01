"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Só tipos: `jobs.ts` é um módulo de servidor e não pode entrar no pacote do navegador.
import type { JobMode, JobStatus } from "./jobs";

export const MSG_NETWORK = "Não foi possível falar com o servidor. Tente de novo.";
const MSG_START_FAILED = "Não foi possível iniciar a voz.";
const MSG_POLL_FAILED = "Não foi possível consultar a voz.";
const MSG_JOB_FAILED = "A geração de voz falhou.";
/** A consulta deu 404: a tarefa sumiu do servidor (reinício, p.ex. num deploy). */
export const MSG_RESTARTED = "A voz foi interrompida (o servidor reiniciou). Tente de novo.";

const POLL_MS = 1000;
const JOBS_URL = "/api/voz/jobs";

export type VoiceJobInput = { studyId: string; start: number; end: number; mode: JobMode };

export type VoiceJob = {
  status: JobStatus | null;
  /** Há uma criação ou uma tarefa em andamento (na fila ou gerando). */
  busy: boolean;
  error: string | null;
  start(input: VoiceJobInput): Promise<string | null>;
  cancel(): Promise<void>;
  /** Esquece a tarefa (sem status nem erro); se ainda estava ativa, cancela no servidor. */
  reset(): void;
};

const jobUrl = (id: string) => `${JOBS_URL}/${encodeURIComponent(id)}`;

/** Mensagem `{ message }` do corpo de uma resposta de erro, se houver. */
async function readMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === "string" && message.trim() !== "") return message;
    }
  } catch {
    // corpo que não é JSON
  }
  return null;
}

const KNOWN_STATES = ["na-fila", "gerando", "pronto", "erro", "cancelado"];

/** O corpo de uma consulta só vale se for um objeto com um estado conhecido; senão é falha da consulta. */
function parseStatus(body: unknown): JobStatus | null {
  if (typeof body !== "object" || body === null) return null;
  const state = (body as { state?: unknown }).state;
  return typeof state === "string" && KNOWN_STATES.includes(state) ? (body as JobStatus) : null;
}

/** Cancela no servidor sem esperar resposta (a página pode estar sendo fechada): DELETE com keepalive. */
function cancelOnServer(id: string): void {
  try {
    void Promise.resolve(fetch(jobUrl(id), { method: "DELETE", keepalive: true })).catch(() => {});
  } catch {
    // sem rede: a tarefa se cancela sozinha por inatividade no servidor
  }
}

export function useVoiceJob(): VoiceJob {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O estado só desabilita o botão no próximo render; o ref barra o segundo clique do mesmo instante.
  const busyRef = useRef(false);
  // Id da tarefa em andamento (nulo quando não há ou já terminou).
  const activeId = useRef<string | null>(null);
  // Geração: cada start/cancel/desmontagem a troca, e respostas de uma geração anterior são ignoradas.
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpGeneration = useCallback(() => {
    generation.current++;
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const settle = useCallback(() => {
    clearTimer();
    activeId.current = null;
    busyRef.current = false;
    setBusy(false);
  }, [clearTimer]);

  // Consulta o estado até a tarefa terminar. Um laço (e não um timer que chama a si mesmo) com uma espera de 1 s
  // entre as respostas: nunca há duas consultas ao mesmo tempo.
  const poll = useCallback(
    async (id: string, gen: number) => {
      // Qualquer falha da consulta deixa a tela limpa e pronta para tentar de novo: para de consultar, pede o
      // cancelamento (senão a nova tentativa bate em "você já tem uma voz em andamento") e zera o progresso.
      const failPoll = (message: string) => {
        cancelOnServer(id);
        settle();
        setStatus(null);
        setError(message);
      };

      while (gen === generation.current) {
        let next: JobStatus | null = null;
        let failure: string | null = null;
        try {
          const response = await fetch(jobUrl(id));
          if (response.status === 404) {
            failure = MSG_RESTARTED;
          } else if (!response.ok) {
            failure = (await readMessage(response)) ?? MSG_POLL_FAILED;
          } else {
            try {
              next = parseStatus(await response.json());
            } catch {
              next = null;
            }
            if (next === null) failure = MSG_POLL_FAILED;
          }
        } catch {
          failure = MSG_NETWORK;
        }
        if (gen !== generation.current) return;

        if (next === null) {
          failPoll(failure ?? MSG_POLL_FAILED);
          return;
        }

        setStatus(next);
        if (next.state === "pronto" || next.state === "erro" || next.state === "cancelado") {
          settle();
          if (next.state === "erro") setError(next.message ?? MSG_JOB_FAILED);
          return;
        }
        await new Promise<void>((resolve) => {
          timer.current = setTimeout(() => {
            timer.current = null;
            resolve();
          }, POLL_MS);
        });
      }
    },
    [settle],
  );

  const start = useCallback(
    async (input: VoiceJobInput): Promise<string | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setStatus(null);
      const gen = ++generation.current;

      let response: Response;
      try {
        response = await fetch(JOBS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
      } catch {
        if (gen === generation.current) {
          settle();
          setError(MSG_NETWORK);
        }
        return null;
      }

      let id: string | null = null;
      let message: string | null = null;
      if (response.ok) {
        try {
          const body = (await response.json()) as { id?: unknown };
          if (typeof body.id === "string" && body.id !== "") id = body.id;
        } catch {
          // tratado abaixo como falha
        }
      } else {
        message = await readMessage(response);
      }

      // Cancelado ou desmontado enquanto a criação respondia: a tarefa que nasceu não pode ficar órfã.
      if (gen !== generation.current) {
        if (id) cancelOnServer(id);
        return null;
      }
      if (!id) {
        settle();
        setError(message ?? MSG_START_FAILED);
        return null;
      }

      activeId.current = id;
      setStatus({ id, mode: input.mode, state: "na-fila", total: 0, feitas: 0, readyCells: [] });
      void poll(id, gen);
      return id;
    },
    [poll, settle],
  );

  const cancel = useCallback(async (): Promise<void> => {
    const id = activeId.current;
    if (!id) return;
    generation.current++;
    settle();
    setStatus((current) => (current ? { ...current, state: "cancelado" } : current));
    try {
      await fetch(jobUrl(id), { method: "DELETE", keepalive: true });
    } catch {
      // a tarefa se cancela sozinha por inatividade no servidor
    }
  }, [settle]);

  // Solta a tarefa (p.ex. a tela Ler descobriu que ela sumiu do servidor): sem status nem erro, e o próximo
  // start cria outra. Se ela ainda estava ativa, para de consultar e pede o cancelamento.
  const reset = useCallback((): void => {
    const id = activeId.current;
    generation.current++;
    settle();
    setStatus(null);
    setError(null);
    if (id) cancelOnServer(id);
  }, [settle]);

  useEffect(() => {
    const leave = () => {
      const id = activeId.current;
      if (id) cancelOnServer(id);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      bumpGeneration();
      clearTimer();
      leave();
      activeId.current = null;
      busyRef.current = false;
    };
  }, [bumpGeneration, clearTimer]);

  return { status, busy, error, start, cancel, reset };
}
