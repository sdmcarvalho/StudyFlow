import type { Cell } from "@/features/estudo/content-schema";

export type RemovedCell = { cell: Cell; index: number };

export function newCellId(): string {
  return crypto.randomUUID();
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
