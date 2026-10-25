import { z } from "zod";

/** Este módulo é client-safe: sem node:fs nem acesso ao banco. */

export type Cell = { id: string; texto: string };

export const MAX_CELLS = 500;
export const MAX_CELL_CHARS = 200_000;
export const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/** "200000" → "200 000" (separador de milhar com espaço, como no restante do texto). */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Aviso do editor quando o documento passa de algum limite (e por isso não é enviado). */
export const CONTENT_LIMIT_MESSAGE =
  `O documento passou do limite (${groupThousands(MAX_CELLS)} células, ` +
  `${groupThousands(MAX_CELL_CHARS)} caracteres por célula, ${MAX_CONTENT_BYTES / (1024 * 1024)} MB). ` +
  "Reduza o texto para salvar.";

const cellSchema = z.object({
  id: z.string().min(1).max(64),
  texto: z.string().max(MAX_CELL_CHARS),
});

const cellsSchema = z
  .array(cellSchema)
  .max(MAX_CELLS)
  .refine((list) => new Set(list.map((cell) => cell.id)).size === list.length);

export type ParseContentResult = { ok: true; cells: Cell[] } | { ok: false };

export function serializeContent(cells: Cell[]): string {
  return JSON.stringify(cells);
}

/** Valida células vindas do cliente. Nunca lança. */
export function parseContent(raw: unknown): ParseContentResult {
  const result = cellsSchema.safeParse(raw);
  if (!result.success) return { ok: false };

  const cells = result.data;
  if (new TextEncoder().encode(serializeContent(cells)).length > MAX_CONTENT_BYTES) {
    return { ok: false };
  }
  return { ok: true, cells };
}

/** Lê o `conteudo` gravado no banco. JSON inválido ou fora das regras vira documento vazio. */
export function parseStoredContent(json: string): Cell[] {
  try {
    const parsed = parseContent(JSON.parse(json));
    return parsed.ok ? parsed.cells : [];
  } catch {
    return [];
  }
}
