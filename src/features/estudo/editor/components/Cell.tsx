"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import type { Cell as CellData } from "../../content-schema";
import type { EditorMode } from "../editor-mode";
import { MarkdownView, type ImageRange } from "./MarkdownView";
import { DragHandleIcon } from "./toolbar-icons";
import styles from "./Cell.module.css";

/** O que o `CellList` passa quando a célula está dentro do contexto de arrastar. */
export type CellDrag = {
  setNodeRef: (element: HTMLElement | null) => void;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  style?: CSSProperties;
  isDragging: boolean;
};

export type CellProps = {
  cell: CellData;
  index: number;
  total: number;
  mode: EditorMode;
  editing: boolean;
  studyId: string;
  onEdit: (id: string) => void;
  onStopEditing: () => void;
  onChange: (id: string, texto: string) => void;
  onAddBelow: (id: string) => void;
  onDelete: (id: string) => void;
  onResizeImage?: (id: string, range: ImageRange, width: number) => void;
  registerTextarea: (id: string, element: HTMLTextAreaElement | null) => void;
  drag?: CellDrag;
};

export function Cell({
  cell,
  index,
  total,
  mode,
  editing,
  studyId,
  onEdit,
  onStopEditing,
  onChange,
  onAddBelow,
  onDelete,
  onResizeImage,
  registerTextarea,
  drag,
}: CellProps) {
  const { id, texto } = cell;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef(false);

  const readOnly = mode === "preview";
  const showEditor = mode === "split" || (mode === "default" && editing);
  const number = index + 1;

  const setNodeRef = drag?.setNodeRef;
  const setContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      containerRef.current = element;
      setNodeRef?.(element);
    },
    [setNodeRef],
  );

  const setTextareaRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      textareaRef.current = element;
      registerTextarea(id, element);
    },
    [id, registerTextarea],
  );

  // Ao entrar em edição, o foco vai para o texto com o cursor no fim.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!editing || !textarea) return;
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [editing]);

  // Saiu da edição pelo Esc: o foco volta para a célula renderizada.
  useEffect(() => {
    if (editing || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    viewRef.current?.focus();
  }, [editing]);

  const handleResize = useCallback(
    (range: ImageRange, width: number) => onResizeImage?.(id, range, width),
    [id, onResizeImage],
  );
  const resize = onResizeImage && !readOnly ? handleResize : undefined;

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (mode !== "default" || !editing) return;
    const next = event.relatedTarget as HTMLElement | null;
    if (next && (containerRef.current?.contains(next) || next.closest("[data-keep-editing]"))) return;
    // Trocar de janela tira o foco sem "clicar fora": a edição continua.
    if (!next && typeof document.hasFocus === "function" && !document.hasFocus()) return;
    onStopEditing();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      restoreFocusRef.current = mode === "default";
      onStopEditing();
    }
  }

  function handleViewClick(event: MouseEvent<HTMLDivElement>) {
    // Links do conteúdo continuam funcionando como links.
    if ((event.target as HTMLElement).closest("a")) return;
    onEdit(id);
  }

  function handleViewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit(id);
    }
  }

  const classes = [
    styles.cell,
    readOnly ? styles.readOnly : "",
    showEditor ? styles.editing : "",
    drag?.isDragging ? styles.dragging : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setContainerRef}
      role="group"
      aria-label={`Célula ${number} de ${total}`}
      className={classes}
      style={drag?.style}
      // Clicar numa área sem foco dentro da célula mantém o foco nela (não conta como "clicar fora").
      tabIndex={-1}
      onBlur={handleBlur}
    >
      {readOnly ? null : (
        <div className={styles.controls}>
          <button
            ref={drag?.setActivatorNodeRef}
            type="button"
            className={`${styles.control} ${styles.handle}`}
            title="Arrastar célula"
            {...drag?.attributes}
            {...drag?.listeners}
            aria-label="Arrastar célula"
          >
            <DragHandleIcon />
          </button>
          <button
            type="button"
            className={`${styles.control} ${styles.trash}`}
            title="Excluir célula"
            aria-label="Excluir célula"
            onClick={() => onDelete(id)}
          >
            <TrashIcon />
          </button>
        </div>
      )}

      <div className={styles.body}>
        {showEditor ? (
          <div className={styles.split}>
            <textarea
              ref={setTextareaRef}
              className={styles.textarea}
              aria-label={`Markdown da célula ${number}`}
              spellCheck
              value={texto}
              onChange={(event) => onChange(id, event.target.value)}
              onKeyDown={handleTextareaKeyDown}
            />
            <div className={styles.live}>
              <MarkdownView texto={texto} studyId={studyId} onResizeImage={resize} />
            </div>
          </div>
        ) : readOnly ? (
          <div className={styles.rendered}>
            <MarkdownView texto={texto} studyId={studyId} />
          </div>
        ) : (
          <div
            ref={viewRef}
            role="button"
            tabIndex={0}
            aria-label={`Editar célula ${number}`}
            className={`${styles.rendered} ${styles.clickable}`}
            onClick={handleViewClick}
            onKeyDown={handleViewKeyDown}
          >
            {texto.trim() === "" ? (
              <p className={styles.empty}>Célula vazia. Clique para editar.</p>
            ) : (
              <MarkdownView texto={texto} studyId={studyId} onResizeImage={resize} />
            )}
          </div>
        )}

        {readOnly ? null : (
          <button
            type="button"
            className={styles.add}
            title="Adicionar célula abaixo"
            aria-label="Adicionar célula abaixo"
            onClick={() => onAddBelow(id)}
          >
            <PlusIcon />
          </button>
        )}
      </div>
    </div>
  );
}
