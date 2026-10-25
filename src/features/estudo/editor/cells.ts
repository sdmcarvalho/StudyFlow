import type { Cell } from "@/features/estudo/content-schema";

export type RemovedCell = { cell: Cell; index: number };

/**
 * Id novo de célula. `crypto.randomUUID` só existe em contexto seguro (https ou localhost); aberto
 * por http://192.168.x.x o editor usa `getRandomValues`, que existe em qualquer contexto.
 */
export function newCellId(): string {
  const { crypto } = globalThis;
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return uuidV4FromRandomValues(crypto);
}

function uuidV4FromRandomValues(crypto: Crypto): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function emptyCell(id: string): Cell {
  return { id, texto: "" };
}

export function ensureAtLeastOne(cells: Cell[], newId?: string): Cell[] {
  if (cells.length > 0) return cells;
  return [emptyCell(newId ?? newCellId())];
}

export function addCellAfter(
  cells: Cell[],
  afterId: string,
  newId: string,
): Cell[] {
  const index = cells.findIndex((cell) => cell.id === afterId);
  const position = index === -1 ? cells.length : index + 1;
  return [...cells.slice(0, position), emptyCell(newId), ...cells.slice(position)];
}

export function removeCell(
  cells: Cell[],
  id: string,
  newId: string,
): { cells: Cell[]; removed: RemovedCell | null } {
  const index = cells.findIndex((cell) => cell.id === id);
  if (index === -1) return { cells, removed: null };
  const rest = cells.filter((_, i) => i !== index);
  return {
    cells: ensureAtLeastOne(rest, newId),
    removed: { cell: cells[index], index },
  };
}

export function restoreCell(cells: Cell[], removed: RemovedCell): Cell[] {
  const position = Math.min(Math.max(removed.index, 0), cells.length);
  return [...cells.slice(0, position), removed.cell, ...cells.slice(position)];
}

function isIndexInRange(cells: Cell[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < cells.length;
}

export function moveCell(
  cells: Cell[],
  fromIndex: number,
  toIndex: number,
): Cell[] {
  if (
    fromIndex === toIndex ||
    !isIndexInRange(cells, fromIndex) ||
    !isIndexInRange(cells, toIndex)
  ) {
    return cells;
  }
  const next = [...cells];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function updateCellText(
  cells: Cell[],
  id: string,
  texto: string,
): Cell[] {
  return cells.map((cell) => (cell.id === id ? { ...cell, texto } : cell));
}
