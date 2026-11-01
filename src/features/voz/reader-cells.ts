// Células do intervalo da tela Ler. Módulo puro (a página `ler` chama; os testes cobrem aqui).
import type { Cell } from "@/features/estudo/content-schema";
import { validateRange } from "./range";
import { toSpeakable } from "./speakable";

export type ReaderCell = {
  /** Número da célula (posição + 1). */
  n: number;
  texto: string;
  /** Tem texto para ler em voz alta. */
  speakable: boolean;
};

/** Células de `start` a `end` (números de 1 em diante, já validados), com o número e se são faláveis. */
export function buildReaderCells(cells: Cell[], start: number, end: number): ReaderCell[] {
  const out: ReaderCell[] = [];
  const to = Math.min(cells.length, end);
  for (let n = Math.max(1, start); n <= to; n++) {
    const texto = cells[n - 1].texto;
    out.push({ n, texto, speakable: toSpeakable(texto) !== "" });
  }
  return out;
}

export type ReaderRange = { ok: true; cells: ReaderCell[] } | { ok: false; messages: string[] };

/**
 * Valida `de` e `ate` (valores crus de `searchParams`: texto, lista ou ausente) e monta as células.
 * Valor inválido nunca é corrigido: devolve as mensagens da validação, sem repetição.
 */
export function resolveReaderRange(cells: Cell[], de: unknown, ate: unknown): ReaderRange {
  const validation = validateRange(de, ate, cells.length);
  if (!validation.ok) {
    const messages = [validation.errors.start, validation.errors.end].filter((m): m is string => Boolean(m));
    return { ok: false, messages: [...new Set(messages)] };
  }
  return { ok: true, cells: buildReaderCells(cells, validation.start, validation.end) };
}
