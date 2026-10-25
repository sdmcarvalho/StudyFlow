"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveStudyContent } from "../actions";
import type { Cell } from "../content-schema";
import { createAutosave, type Autosave, type AutosaveState } from "./autosave";
import {
  addCellAfter,
  ensureAtLeastOne,
  moveCell,
  newCellId,
  removeCell,
  restoreCell,
  updateCellText,
  type RemovedCell,
} from "./cells";
import { setImageWidth } from "./image-width";

const INITIAL_STATE: AutosaveState = { status: "idle", savedAt: null };

export type EditorDocument = {
  cells: Cell[];
  saveState: AutosaveState;
  /** Troca o texto da célula. Id que não existe mais (célula excluída) é ignorado. */
  changeText(id: string, texto: string): void;
  /** Cria uma célula vazia logo abaixo de `id` e devolve o id dela. */
  addBelow(id: string): string;
  remove(id: string): RemovedCell | null;
  undoRemove(removed: RemovedCell): void;
  reorder(from: number, to: number): void;
  resizeImage(id: string, range: { start: number; end: number }, width: number): void;
  /** Salva na hora; `true` só se salvou e não sobrou nada pendente. */
  saveNow(): Promise<boolean>;
};

/** Estado das células do documento e o salvamento automático (`createAutosave`). */
export function useEditorDocument(studyId: string, initialCells: Cell[]): EditorDocument {
  // A célula vazia de um documento novo só é gravada no primeiro salvamento.
  const [cells, setCells] = useState<Cell[]>(() => ensureAtLeastOne(initialCells));
  const [saveState, setSaveState] = useState<AutosaveState>(INITIAL_STATE);
  const cellsRef = useRef(cells);
  const autosaveRef = useRef<Autosave | null>(null);

  useEffect(() => {
    const autosave = createAutosave({
      save: async (next) => (await saveStudyContent(studyId, next)).ok,
      onState: setSaveState,
    });
    autosaveRef.current = autosave;
    return () => {
      autosave.dispose();
      if (autosaveRef.current === autosave) autosaveRef.current = null;
    };
  }, [studyId]);

  /** Aplica uma mudança às células atuais (não às da última renderização) e agenda o salvamento. */
  const commit = useCallback((update: (current: Cell[]) => Cell[]) => {
    const current = cellsRef.current;
    const next = update(current);
    if (next === current) return;
    cellsRef.current = next;
    setCells(next);
    autosaveRef.current?.change(next);
  }, []);

  const changeText = useCallback(
    (id: string, texto: string) =>
      commit((current) => {
        const target = current.find((cell) => cell.id === id);
        if (!target || target.texto === texto) return current;
        return updateCellText(current, id, texto);
      }),
    [commit],
  );

  const addBelow = useCallback(
    (id: string) => {
      const newId = newCellId();
      commit((current) => addCellAfter(current, id, newId));
      return newId;
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      let removed: RemovedCell | null = null;
      commit((current) => {
        const result = removeCell(current, id, newCellId());
        removed = result.removed;
        return result.cells;
      });
      return removed;
    },
    [commit],
  );

  const undoRemove = useCallback(
    (removed: RemovedCell) =>
      commit((current) => {
        if (current.some((cell) => cell.id === removed.cell.id)) return current;
        // Excluir a última célula deixou uma vazia no lugar: desfazer troca a vazia pela original.
        if (current.length === 1 && current[0].texto === "") return [removed.cell];
        return restoreCell(current, removed);
      }),
    [commit],
  );

  const reorder = useCallback(
    (from: number, to: number) => commit((current) => moveCell(current, from, to)),
    [commit],
  );

  const resizeImage = useCallback(
    (id: string, range: { start: number; end: number }, width: number) =>
      commit((current) => {
        const target = current.find((cell) => cell.id === id);
        if (!target) return current;
        const texto = setImageWidth(target.texto, range.start, range.end, width);
        return texto === target.texto ? current : updateCellText(current, id, texto);
      }),
    [commit],
  );

  const saveNow = useCallback(async () => {
    const autosave = autosaveRef.current;
    if (!autosave) return false;
    const ok = await autosave.saveNow();
    return ok && !autosave.hasPending();
  }, []);

  return { cells, saveState, changeText, addBelow, remove, undoRemove, reorder, resizeImage, saveNow };
}
