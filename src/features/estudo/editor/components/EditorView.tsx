"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toast, useToast } from "@/components/ui/Toast";
import type { Cell } from "../../content-schema";
import { normalizeFolderPath } from "../../folder-path";
import type { EditorMode } from "../editor-mode";
import { applyFormat, type FormatAction } from "../markdown-format";
import { applyEditToTextarea } from "../textarea-edit";
import { useUnsavedGuard } from "../unsaved-guard";
import { useEditorDocument } from "../use-editor-document";
import { CellList } from "./CellList";
import { ImageDialog } from "./ImageDialog";
import { Toolbar } from "./Toolbar";
import { UnsavedDialog } from "./UnsavedDialog";
import styles from "./EditorView.module.css";

type EditorViewProps = {
  studyId: string;
  descricao: string;
  pasta: string;
  initialCells: Cell[];
};

export function EditorView({ studyId, descricao, pasta, initialCells }: EditorViewProps) {
  const { cells, saveState, changeText, addBelow, remove, undoRemove, reorder, resizeImage, saveNow } =
    useEditorDocument(studyId, initialCells);
  const { toast, show, hide } = useToast();
  const [mode, setMode] = useState<EditorMode>("default");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Célula que recebe a imagem enquanto o diálogo está aberto; o ref é lido nos eventos de foco.
  const [imageTarget, setImageTarget] = useState<string | null>(null);
  const imageOpenRef = useRef(false);
  const textareasRef = useRef(new Map<string, HTMLTextAreaElement>());

  const imagesEnabled = useMemo(() => normalizeFolderPath(pasta).ok, [pasta]);
  const pending = saveState.status !== "idle" && saveState.status !== "saved";
  const guard = useUnsavedGuard(pending);

  const exists = (id: string | null): id is string => id !== null && cells.some((cell) => cell.id === id);
  const activeEditingId = mode !== "preview" && exists(editingId) ? editingId : null;
  // A barra age na célula em edição; em Dividida, na última célula focada.
  const targetId = mode === "default" ? activeEditingId : mode === "split" && exists(focusedId) ? focusedId : null;

  const registerTextarea = useCallback((id: string, element: HTMLTextAreaElement | null) => {
    if (element) textareasRef.current.set(id, element);
    else textareasRef.current.delete(id);
  }, []);

  const idOfTextarea = useCallback((element: EventTarget | null): string | null => {
    for (const [id, textarea] of textareasRef.current) {
      if (textarea === element) return id;
    }
    return null;
  }, []);

  const formatCell = useCallback(
    (id: string, action: FormatAction) => {
      const textarea = textareasRef.current.get(id);
      if (!textarea) return;
      const edit = applyFormat(textarea.value, textarea.selectionStart, textarea.selectionEnd, action);
      applyEditToTextarea(textarea, edit, (value) => changeText(id, value));
    },
    [changeText],
  );

  const handleSave = useCallback(async () => {
    if (await saveNow()) show("Documento salvo.");
  }, [saveNow, show]);

  // Atalhos: Ctrl+S em qualquer lugar; Ctrl+B / Ctrl+I na textarea de uma célula.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }
      if (key !== "b" && key !== "i") return;
      const id = idOfTextarea(event.target);
      if (id === null) return;
      event.preventDefault();
      formatCell(id, key === "b" ? "bold" : "italic");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [formatCell, handleSave, idOfTextarea]);

  // Clicar fora da célula em edição e da barra encerra a edição. A saída de foco da célula não
  // basta: com o foco já na barra (ou no Safari, que não foca botões), ela não acontece de novo.
  useEffect(() => {
    if (mode !== "default" || activeEditingId === null) return;
    function onPointerDown(event: PointerEvent) {
      if (imageOpenRef.current) return;
      const target = event.target as Element | null;
      if (!target?.closest) return;
      if (target.closest("[data-keep-editing]")) return;
      if (target.closest("[data-cell-id]")?.getAttribute("data-cell-id") === activeEditingId) return;
      setEditingId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mode, activeEditingId]);

  const handleEdit = useCallback((id: string) => setEditingId(id), []);

  const handleStopEditing = useCallback(() => {
    // O diálogo de imagem tira o foco da textarea, mas a célula continua em edição.
    if (imageOpenRef.current) return;
    setEditingId(null);
  }, []);

  const handleAddBelow = useCallback(
    (id: string) => {
      setEditingId(addBelow(id));
    },
    [addBelow],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const removed = remove(id);
      if (!removed) return;
      show("Célula excluída.", () => {
        hide();
        undoRemove(removed);
      });
    },
    [remove, undoRemove, show, hide],
  );

  const handleImageError = useCallback((message: string) => show(message), [show]);

  function handleModeChange(next: EditorMode) {
    // Os botões de modo não tiram o foco: a textarea focada continua em edição no modo padrão.
    const focused = idOfTextarea(document.activeElement);
    setMode(next);
    if (next === "preview") setEditingId(null);
    else if (next === "default") setEditingId(focused);
  }

  function openImage() {
    if (targetId === null || !imagesEnabled) return;
    imageOpenRef.current = true;
    setImageTarget(targetId);
  }

  function closeImage() {
    imageOpenRef.current = false;
    setImageTarget(null);
  }

  function insertImage(markdown: string) {
    const id = imageTarget;
    if (!exists(id)) return;
    const textarea = textareasRef.current.get(id);
    if (textarea?.isConnected) {
      const { value, selectionStart, selectionEnd } = textarea;
      const caret = selectionStart + markdown.length;
      applyEditToTextarea(
        textarea,
        { text: value.slice(0, selectionStart) + markdown + value.slice(selectionEnd), selStart: caret, selEnd: caret },
        (next) => changeText(id, next),
      );
      return;
    }
    const current = cells.find((cell) => cell.id === id)?.texto ?? "";
    changeText(id, current === "" ? markdown : `${current}\n\n${markdown}`);
  }

  return (
    <div className={styles.editor}>
      <header className={styles.header}>
        <Link href="/estudo" className={styles.back}>
          ← Estudo
        </Link>
        <h1 className={styles.title}>{descricao}</h1>
      </header>

      <Toolbar
        mode={mode}
        onModeChange={handleModeChange}
        canFormat={targetId !== null}
        onFormat={(action) => {
          if (targetId !== null) formatCell(targetId, action);
        }}
        onImage={openImage}
        imageDisabled={!imagesEnabled}
        state={saveState}
        onSave={() => void handleSave()}
      />

      {imagesEnabled ? null : <p className={styles.warning}>Defina uma pasta válida para usar imagens</p>}

      <div className={styles.cells}>
        <CellList
          cells={cells}
          mode={mode}
          editingId={activeEditingId}
          studyId={studyId}
          onReorder={reorder}
          onEdit={handleEdit}
          onStopEditing={handleStopEditing}
          onChange={changeText}
          onAddBelow={handleAddBelow}
          onDelete={handleDelete}
          onResizeImage={resizeImage}
          registerTextarea={registerTextarea}
          onFocusCell={setFocusedId}
          onImageError={handleImageError}
        />
      </div>

      <ImageDialog open={imageTarget !== null} studyId={studyId} onClose={closeImage} onInsert={insertImage} />
      <UnsavedDialog open={guard.pendingHref !== null} onStay={guard.stay} onLeave={guard.leave} />
      <Toast message={toast?.message ?? ""} visible={toast !== null} onUndo={toast?.onUndo} />
    </div>
  );
}
