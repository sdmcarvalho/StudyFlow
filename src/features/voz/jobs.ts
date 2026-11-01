// Tarefas de voz (Ler e Gravar) e a amostra da Configuração. Só para o servidor.
//
// - Registro em memória, guardado em `globalThis` (sobrevive ao hot reload do `next dev`).
// - Um slot global: uma geração por vez no servidor; o resto espera numa fila FIFO (tarefas e amostras).
// - No máximo uma tarefa ativa (`na-fila`/`gerando`) por usuário; amostras não contam, mas esperam o slot.
// - Cada tarefa tem um AbortController: dispara ao cancelar, por inatividade (60 s sem consulta de status) ou no
//   tempo máximo (20 min de geração). O motor não tem tempo limite próprio: quem o garante é este módulo.
// - Só as células que não estão no cache vão para o motor (uma chamada por tarefa); cada WAV vira MP3 pelo
//   mesmo caminho (encodeMp3 → cachePut), então Ler e Gravar do mesmo trecho dão os mesmos bytes por célula.
// - Memória: os MP3 das células ficam em Buffers na tarefa (as leituras são síncronas e o cache em disco pode ser
//   podado a qualquer momento). Para limitar, ao criar uma tarefa as tarefas terminadas do mesmo usuário são
//   descartadas: cada usuário tem no máximo uma tarefa guardada. Terminadas somem também depois de 1 hora.
import { randomUUID } from "node:crypto";
import { getStudyDocument } from "@/features/estudo/queries";
import { cacheGet, cacheKey, cachePrune, cachePut } from "@/features/voz/cache";
import { isInstalledVoice } from "@/features/voz/engine/catalog";
import { getEngine } from "@/features/voz/engine/index";
import {
  MSG_VOICE_FAILED,
  speakableItems,
  VoiceError,
  type SpeechEngine,
  type SpeechItem,
} from "@/features/voz/engine/types";
import { encodeMp3 } from "@/features/voz/mp3";
import { getVoiceSettings } from "@/features/voz/queries";
import { audioFileName, validateRange } from "@/features/voz/range";
import type { VoiceSettings } from "@/features/voz/settings-schema";
import { selectSpeakable } from "@/features/voz/speakable";

export type JobMode = "ler" | "gravar";
export type JobState = "na-fila" | "gerando" | "pronto" | "erro" | "cancelado";
export type JobStatus = {
  id: string;
  mode: JobMode;
  state: JobState;
  total: number;
  feitas: number;
  readyCells: number[];
  message?: string;
};

export type CreateJobResult = { ok: true; id: string } | { ok: false; status: number; message: string };

export const DEFAULT_MAX_CHARS = 60_000;
/** Tempo máximo de geração de uma tarefa (conta a partir de quando ela sai da fila). */
export const JOB_MAX_MS = 20 * 60 * 1000;
/** Sem consulta de status por esse tempo, a tarefa ativa é cancelada (aba fechada). */
export const JOB_IDLE_MS = 60 * 1000;
/** Tarefa terminada (pronta, com erro ou cancelada) é apagada depois disso. */
export const JOB_RETENTION_MS = 60 * 60 * 1000;
/** Tempo máximo de uma amostra, contando a espera na fila. */
export const SAMPLE_TIMEOUT_MS = 60 * 1000;
export const SAMPLE_TEXT = "Esta é uma amostra da voz escolhida.";

export const MSG_STUDY_NOT_FOUND = "Estudo não encontrado.";
export const MSG_INVALID_INPUT = "Dados inválidos.";
export const MSG_NO_TEXT = "As células escolhidas não têm texto para ler.";
export const MSG_BUSY = "Você já tem uma voz em andamento.";
export const MSG_NOT_INSTALLED = "A voz não está instalada neste ambiente.";
export const MSG_VOICE_MISSING = "A voz escolhida não está instalada. Escolha outra em Configuração.";
export const MSG_TOO_SLOW = "A geração demorou demais.";
export const MSG_SAMPLE_BUSY = "A voz está ocupada agora. Tente de novo em instantes.";
export const MSG_SAMPLE_PENDING = "Aguarde a amostra anterior terminar.";

/** Erro da amostra com o status HTTP que a rota devolve. */
export class SampleError extends VoiceError {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SampleError";
    this.status = status;
  }
}

type Timer = ReturnType<typeof setTimeout>;

type Job = {
  id: string;
  userId: string;
  mode: JobMode;
  state: JobState;
  message?: string;
  descricao: string;
  start: number;
  end: number;
  settings: VoiceSettings;
  engine: SpeechEngine;
  /** Células com texto falável, na ordem; `total` = tamanho desta lista. */
  items: SpeechItem[];
  keys: Map<number, string>;
  mp3: Map<number, Buffer>;
  readyCells: number[];
  /** Células que ainda vão para o motor (as demais vieram do cache). */
  misses: SpeechItem[];
  controller: AbortController;
  timedOut: boolean;
  idleTimer?: Timer;
  maxTimer?: Timer;
  retentionTimer?: Timer;
  finishedAt?: number;
};

/** Entrada da fila do slot único: uma tarefa ou uma amostra. */
type SlotEntry = { run: () => Promise<void>; abort: () => void };

type Store = {
  jobs: Map<string, Job>;
  queue: SlotEntry[];
  running: SlotEntry | null;
  /** Usuários com uma amostra esperando ou gerando. */
  samples: Set<string>;
  /** Usuários no meio de um createJob (fecha a janela do clique duplo antes de a tarefa existir). */
  creating: Set<string>;
  /** Timers e AbortControllers das amostras, para o reset dos testes. */
  sampleCleanups: Set<() => void>;
};

const globalStore = globalThis as typeof globalThis & { __studyflowVozJobs?: Store };

function store(): Store {
  globalStore.__studyflowVozJobs ??= {
    jobs: new Map(),
    queue: [],
    running: null,
    samples: new Set(),
    creating: new Set(),
    sampleCleanups: new Set(),
  };
  return globalStore.__studyflowVozJobs;
}

/** setTimeout que não segura o processo do Node vivo. */
function timer(ms: number, fn: () => void): Timer {
  const handle = setTimeout(fn, ms);
  (handle as { unref?: () => void }).unref?.();
  return handle;
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function maxChars(): number {
  return positiveIntEnv("STUDYFLOW_VOZ_MAX_CHARS", DEFAULT_MAX_CHARS);
}

function jobMaxMs(): number {
  return positiveIntEnv("STUDYFLOW_VOZ_JOB_TIMEOUT_MS", JOB_MAX_MS);
}

/** "60000" → "60 000" (mesma convenção de content-schema.ts). */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** O motor falso não exige voz instalada; o Piper sim (o id só chega ao motor depois do catálogo). */
function requiresInstalledVoice(): boolean {
  return process.env.STUDYFLOW_VOZ_ENGINE !== "fake";
}

async function resolveEngine(voice: string): Promise<{ ok: true; engine: SpeechEngine } | { ok: false; message: string }> {
  const engine = await getEngine();
  if (!engine) return { ok: false, message: MSG_NOT_INSTALLED };
  if (requiresInstalledVoice() && !(await isInstalledVoice(voice))) return { ok: false, message: MSG_VOICE_MISSING };
  return { ok: true, engine };
}

const isActive = (job: Job) => job.state === "na-fila" || job.state === "gerando";

// ---------------------------------------------------------------------------------------------- fila / slot

function pump(): void {
  const s = store();
  if (s.running || s.queue.length === 0) return;
  const entry = s.queue.shift()!;
  s.running = entry;
  void entry
    .run()
    .catch((error: unknown) => console.error("Falha inesperada na fila de voz:", error))
    .finally(() => {
      // Depois de um reset dos testes, a entrada antiga não mexe na fila nova.
      if (s.running === entry) {
        s.running = null;
        pump();
      }
    });
}

function enqueue(entry: SlotEntry): void {
  store().queue.push(entry);
  pump();
}

function dequeue(entry: SlotEntry): void {
  const queue = store().queue;
  const index = queue.indexOf(entry);
  if (index >= 0) queue.splice(index, 1);
}

/** Corre `work` contra o sinal: se ele abortar, rejeita na hora, mesmo que o motor não responda ao abort. */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new VoiceError(MSG_VOICE_FAILED));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new VoiceError(MSG_VOICE_FAILED));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

// ---------------------------------------------------------------------------------------------- tarefas

function finish(job: Job, state: "pronto" | "erro" | "cancelado", message?: string): void {
  if (!isActive(job)) return;
  job.state = state;
  if (message !== undefined) job.message = message;
  clearTimeout(job.idleTimer);
  clearTimeout(job.maxTimer);
  job.idleTimer = undefined;
  job.maxTimer = undefined;
  job.finishedAt = Date.now();
  if (state !== "pronto") job.controller.abort();
  job.retentionTimer = timer(JOB_RETENTION_MS, () => {
    const s = store();
    if (s.jobs.get(job.id) === job) s.jobs.delete(job.id);
  });
}

function touch(job: Job): void {
  if (!isActive(job)) return;
  clearTimeout(job.idleTimer);
  job.idleTimer = timer(JOB_IDLE_MS, () => cancelInternal(job));
}

function markReady(job: Job, n: number, mp3: Buffer): void {
  if (!isActive(job) || job.mp3.has(n)) return;
  job.mp3.set(n, mp3);
  job.readyCells.push(n);
}

function cancelInternal(job: Job): void {
  if (!isActive(job)) return;
  if (job.state === "na-fila") dequeue(slotOf(job));
  finish(job, "cancelado");
}

// A entrada da fila de cada tarefa (criada uma vez, para poder tirá-la da fila ao cancelar).
const slots = new WeakMap<Job, SlotEntry>();
function slotOf(job: Job): SlotEntry {
  let entry = slots.get(job);
  if (!entry) {
    entry = { run: () => runJob(job), abort: () => cancelInternal(job) };
    slots.set(job, entry);
  }
  return entry;
}

async function runJob(job: Job): Promise<void> {
  if (job.state !== "na-fila") return;
  job.state = "gerando";
  const signal = job.controller.signal;
  job.maxTimer = timer(jobMaxMs(), () => {
    job.timedOut = true;
    job.controller.abort();
  });

  // Cada WAV entregue vira MP3 em ordem (encadeado), vai para o cache e só então a célula fica pronta.
  let chain: Promise<void> = Promise.resolve();
  let encodeError: unknown = null;
  const onCell = (n: number, wav: Buffer) => {
    if (signal.aborted) return;
    const key = job.keys.get(n);
    if (key === undefined) return;
    chain = chain.then(async () => {
      if (signal.aborted || encodeError) return;
      try {
        const mp3 = await encodeMp3(wav);
        if (signal.aborted) return;
        await cachePut(key, mp3);
        markReady(job, n, mp3);
      } catch (error) {
        encodeError = error;
      }
    });
  };

  try {
    await raceAbort(
      (async () => {
        await job.engine.synthesize(job.misses, job.settings, signal, onCell);
        await chain;
      })(),
      signal,
    );
    if (encodeError) throw encodeError;
    if (job.readyCells.length !== job.items.length) throw new VoiceError(MSG_VOICE_FAILED);
    finish(job, "pronto");
  } catch (error) {
    if (job.timedOut) finish(job, "erro", MSG_TOO_SLOW);
    else if (signal.aborted) finish(job, "cancelado");
    else {
      // O usuário vê só a mensagem em pt-BR; o detalhe fica no log do servidor.
      console.error("Falha na geração de voz:", error);
      finish(job, "erro", error instanceof VoiceError ? error.message : MSG_VOICE_FAILED);
    }
  }
}

function fail(status: number, message: string): CreateJobResult {
  return { ok: false, status, message };
}

/**
 * Valida e cria a tarefa. `userId` precisa ser o usuário da sessão: o Estudo e a configuração de voz são lidos
 * do banco com a sessão atual (o texto nunca vem do navegador).
 */
export async function createJob(
  userId: string,
  input: { studyId: string; start: unknown; end: unknown; mode: JobMode },
): Promise<CreateJobResult> {
  const source = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const mode = source.mode;
  const studyId = source.studyId;
  if ((mode !== "ler" && mode !== "gravar") || typeof studyId !== "string" || studyId.length === 0) {
    return fail(400, MSG_INVALID_INPUT);
  }

  const s = store();
  // Uma criação por vez por usuário: o clique duplo não passa das validações em paralelo.
  if (s.creating.has(userId)) return fail(409, MSG_BUSY);
  s.creating.add(userId);
  try {
    await cachePrune().catch(() => {});

    const study = await getStudyDocument(studyId);
    if (!study) return fail(404, MSG_STUDY_NOT_FOUND);

    const range = validateRange(source.start, source.end, study.cells.length);
    if (!range.ok) return fail(400, range.errors.start ?? range.errors.end ?? MSG_INVALID_INPUT);

    const items = speakableItems(selectSpeakable(study.cells, range.start, range.end).items);
    if (items.length === 0) return fail(400, MSG_NO_TEXT);

    const chars = items.reduce((sum, item) => sum + item.text.length, 0);
    const limit = maxChars();
    if (chars > limit) {
      return fail(
        400,
        `O trecho tem ${groupThousands(chars)} caracteres; o limite é ${groupThousands(limit)}. Escolha menos células.`,
      );
    }

    const settings = await getVoiceSettings();
    const resolved = await resolveEngine(settings.voice);
    if (!resolved.ok) return fail(503, resolved.message);

    for (const job of s.jobs.values()) {
      if (job.userId === userId && isActive(job)) return fail(409, MSG_BUSY);
    }
    // Terminadas do mesmo usuário saem: no máximo uma tarefa guardada (e seus MP3) por usuário.
    for (const job of [...s.jobs.values()]) {
      if (job.userId === userId) {
        clearTimeout(job.retentionTimer);
        s.jobs.delete(job.id);
      }
    }

    const job: Job = {
      id: randomUUID(),
      userId,
      mode,
      state: "na-fila",
      descricao: study.descricao,
      start: range.start,
      end: range.end,
      settings,
      engine: resolved.engine,
      items,
      keys: new Map(items.map((item) => [item.n, cacheKey(settings, item.text)])),
      mp3: new Map(),
      readyCells: [],
      misses: [],
      controller: new AbortController(),
      timedOut: false,
    };
    s.jobs.set(job.id, job);
    touch(job);

    // Células já no cache ficam prontas na hora; só as outras vão para o motor.
    for (const item of items) {
      const hit = await cacheGet(job.keys.get(item.n)!);
      if (!isActive(job)) return { ok: true, id: job.id };
      if (hit) markReady(job, item.n, hit);
      else job.misses.push(item);
    }
    if (job.misses.length === 0) finish(job, "pronto");
    else enqueue(slotOf(job));
    return { ok: true, id: job.id };
  } finally {
    s.creating.delete(userId);
  }
}

function ownJob(userId: string, id: string): Job | null {
  if (typeof id !== "string") return null;
  const job = store().jobs.get(id);
  return job && job.userId === userId ? job : null;
}

/** Estado da tarefa do usuário, ou null. Renova o "último contato" (inatividade). */
export function getJobStatus(userId: string, id: string): JobStatus | null {
  const job = ownJob(userId, id);
  if (!job) return null;
  touch(job);
  const status: JobStatus = {
    id: job.id,
    mode: job.mode,
    state: job.state,
    total: job.items.length,
    feitas: job.readyCells.length,
    readyCells: [...job.readyCells],
  };
  if (job.message !== undefined) status.message = job.message;
  return status;
}

/** MP3 da célula `n`, se ela já está pronta. */
export function getCellMp3(userId: string, id: string, n: number): Buffer | null {
  return ownJob(userId, id)?.mp3.get(n) ?? null;
}

/** MP3 completo (células na ordem), só no modo gravar e depois de pronto. */
export function getFullMp3(userId: string, id: string): { mp3: Buffer; fileName: string } | null {
  const job = ownJob(userId, id);
  if (!job || job.mode !== "gravar" || job.state !== "pronto") return null;
  const parts = job.items.map((item) => job.mp3.get(item.n)).filter((mp3): mp3 is Buffer => mp3 !== undefined);
  return { mp3: Buffer.concat(parts), fileName: audioFileName(job.descricao, job.start, job.end) };
}

/** Cancela a tarefa do usuário (sem efeito se já terminou). `false` se ela não existe para ele. */
export function cancelJob(userId: string, id: string): boolean {
  const job = ownJob(userId, id);
  if (!job) return false;
  cancelInternal(job);
  return true;
}

// ---------------------------------------------------------------------------------------------- amostra

/**
 * MP3 da frase de amostra com a configuração dada (já validada por `parseVoiceSettings`). Entra na mesma fila
 * das tarefas (sem contar como tarefa do usuário). Lança `SampleError` (com status) ou `VoiceError`.
 */
export async function synthesizeSample(userId: string, settings: VoiceSettings): Promise<Buffer> {
  const resolved = await resolveEngine(settings.voice);
  if (!resolved.ok) throw new SampleError(503, resolved.message);

  const key = cacheKey(settings, SAMPLE_TEXT);
  const hit = await cacheGet(key);
  if (hit) return hit;

  const s = store();
  if (s.samples.has(userId)) throw new SampleError(409, MSG_SAMPLE_PENDING);
  s.samples.add(userId);

  const controller = new AbortController();
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    let started = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      s.samples.delete(userId);
      s.sampleCleanups.delete(cleanup);
      fn();
    };
    const entry: SlotEntry = {
      abort: () => controller.abort(),
      run: async () => {
        if (settled) return;
        started = true;
        const out: { mp3?: Buffer } = {};
        let pending: Promise<void> = Promise.resolve();
        try {
          await raceAbort(
            (async () => {
              await resolved.engine.synthesize([{ n: 1, text: SAMPLE_TEXT }], settings, controller.signal, (_n, wav) => {
                pending = pending.then(async () => {
                  out.mp3 = await encodeMp3(wav);
                });
              });
              await pending;
            })(),
            controller.signal,
          );
          const mp3 = out.mp3;
          if (!mp3) throw new VoiceError(MSG_VOICE_FAILED);
          await cachePut(key, mp3);
          settle(() => resolve(mp3));
        } catch (error) {
          if (!controller.signal.aborted) console.error("Falha na geração da amostra de voz:", error);
          settle(() => reject(error instanceof VoiceError ? error : new VoiceError(MSG_VOICE_FAILED)));
        }
      },
    };
    const cleanup = () => {
      dequeue(entry);
      controller.abort();
      settle(() => reject(new SampleError(503, MSG_SAMPLE_BUSY)));
    };
    const deadline = timer(SAMPLE_TIMEOUT_MS, () => {
      dequeue(entry);
      controller.abort();
      settle(() => reject(new SampleError(started ? 504 : 503, started ? MSG_TOO_SLOW : MSG_SAMPLE_BUSY)));
    });
    s.sampleCleanups.add(cleanup);
    enqueue(entry);
  });
}

// ---------------------------------------------------------------------------------------------- testes

/** Para testes: aborta o que está rodando, cancela timers e esvazia o registro e a fila. */
export function _resetJobsForTests(): void {
  const s = store();
  for (const job of s.jobs.values()) {
    clearTimeout(job.idleTimer);
    clearTimeout(job.maxTimer);
    clearTimeout(job.retentionTimer);
    job.controller.abort();
  }
  for (const cleanup of [...s.sampleCleanups]) cleanup();
  s.running?.abort();
  s.jobs.clear();
  s.queue.length = 0;
  s.running = null;
  s.samples.clear();
  s.creating.clear();
  s.sampleCleanups.clear();
}
