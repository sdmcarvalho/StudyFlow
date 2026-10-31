"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { CardIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { MAX_CELL_CHARS, type Cell as CellData } from "../../content-schema";
import type { EditorMode } from "../editor-mode";
import { imageMarkdown } from "../markdown-format";
import { applyEditToTextarea } from "../textarea-edit";
import { uploadImage } from "../upload";
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
  /** Falso no limite de células: o "+" fica desabilitado. */
  canAddBelow?: boolean;
  onResizeImage?: (id: string, range: ImageRange, width: number) => void;
  registerTextarea: (id: string, element: HTMLTextAreaElement | null) => void;
  /** A textarea desta célula ganhou foco (a barra age sobre a última célula focada). */
  onFocusCell?: (id: string) => void;
  /** Colar ou soltar uma imagem falhou no envio (o editor mostra o toast). */
  onImageError?: (message: string) => void;
  cardCount?: number;
  onOpenCards?: (id: string) => void;
  drag?: CellDrag;
};

/** Arquivos de imagem de um colar/soltar; o servidor valida o conteúdo de verdade. */
function imageFiles(data: DataTransfer | null): File[] {
  if (!data?.files) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

function hasFiles(data: DataTransfer | null): boolean {
  return Array.from(data?.types ?? []).includes("Files");
}

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
  canAddBelow = true,
  onResizeImage,
  registerTextarea,
  onFocusCell,
  onImageError,
  cardCount = 0,
  onOpenCards,
  drag,
}: CellProps) {
  const { id, texto } = cell;
  const hintId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef(false);
  const textoRef = useRef(texto);

  useEffect(() => {
    textoRef.current = texto;
  });

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
    // Já focada (o usuário clicou nela): mantém o cursor onde ele clicou.
    if (!editing || !textarea || document.activeElement === textarea) return;
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

  /** Envia cada imagem e insere `![alt](imagens/…)` no cursor (ou no lugar da seleção). */
  async function insertImages(files: File[]) {
    for (const file of files) {
      const result = await uploadImage(studyId, file);
      if (!result.ok) {
        onImageError?.(result.message);
        continue;
      }
      const markdown = imageMarkdown(result.alt, result.path);
      const textarea = textareaRef.current;
      if (textarea && textarea.isConnected) {
        const { value, selectionStart, selectionEnd } = textarea;
        const caret = selectionStart + markdown.length;
        applyEditToTextarea(
          textarea,
          { text: value.slice(0, selectionStart) + markdown + value.slice(selectionEnd), selStart: caret, selEnd: caret },
          (next) => onChange(id, next),
        );
      } else {
        // A edição terminou durante o envio: a imagem entra no fim da célula.
        const current = textoRef.current;
        onChange(id, current === "" ? markdown : `${current}\n\n${markdown}`);
      }
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = imageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void insertImages(files);
  }

  function handleDragOver(event: DragEvent<HTMLTextAreaElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    // Arquivo solto sem tratamento faria o navegador abrir o arquivo no lugar do editor.
    event.preventDefault();
    const files = imageFiles(event.dataTransfer);
    if (files.length > 0) void insertImages(files);
  }

  function handleViewClick(event: MouseEvent<HTMLDivElement>) {
    // Links do conteúdo continuam funcionando como links.
    if ((event.target as HTMLElement).closest("a")) return;
    if (window.getSelection()?.toString()) return;
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
      // O editor usa o id para saber se um clique caiu dentro da célula em edição.
      data-cell-id={id}
      className={classes}
      style={drag?.style}
      // Clicar numa área sem foco dentro da célula mantém o foco nela (não conta como "clicar fora").
      tabIndex={-1}
      onBlur={handleBlur}
      onFocusCapture={() => onFocusCell?.(id)}
      onMouseUp={() => onFocusCell?.(id)}
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
          {/* Só mostra a posição (o grupo já anuncia "Célula N de M" ao leitor de tela). */}
          <span className={styles.number} aria-hidden="true">
            {number}
          </span>
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
              maxLength={MAX_CELL_CHARS}
              value={texto}
              onChange={(event) => onChange(id, event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              onFocus={() => onFocusCell?.(id)}
              onPaste={handlePaste}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
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
          // Região focável comum (não um botão): o leitor de tela continua lendo títulos,
          // listas, links e imagens do conteúdo; a dica vai na descrição.
          <div
            ref={viewRef}
            tabIndex={0}
            aria-describedby={hintId}
            className={`${styles.rendered} ${styles.clickable}`}
            onClick={handleViewClick}
            onKeyDown={handleViewKeyDown}
          >
            {texto.trim() === "" ? (
              <p className={styles.empty}>Célula vazia. Clique para editar.</p>
            ) : (
              <MarkdownView texto={texto} studyId={studyId} onResizeImage={resize} />
            )}
            <span id={hintId} className={styles.srOnly}>
              Pressione Enter para editar
            </span>
          </div>
        )}

        {cardCount > 0 && onOpenCards && (
          <button
            type="button"
            className={`${styles.control} ${styles.cardBadge}`}
            title={`${cardCount} card${cardCount === 1 ? "" : "s"} desta célula`}
            aria-label={`${cardCount} card${cardCount === 1 ? "" : "s"} desta célula`}
            onClick={(e) => { e.stopPropagation(); onOpenCards(id); }}
          >
            <CardIcon /> <span>{cardCount}</span>
          </button>
        )}

        {readOnly ? null : (
          <button
            type="button"
            className={styles.add}
            title="Adicionar célula abaixo"
            aria-label="Adicionar célula abaixo"
            disabled={!canAddBelow}
            onClick={() => onAddBelow(id)}
          >
            <PlusIcon />
          </button>
        )}
      </div>
    </div>
  );
}
