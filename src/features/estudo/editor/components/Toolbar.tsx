"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { CONTENT_LIMIT_MESSAGE } from "../../content-schema";
import type { AutosaveState } from "../autosave";
import type { EditorMode } from "../editor-mode";
import type { FormatAction } from "../markdown-format";
import {
  BoldIcon,
  BulletListIcon,
  CodeIcon,
  FormulaIcon,
  HeadingIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  NumberedListIcon,
  PreviewIcon,
  QuoteIcon,
  RuleIcon,
  SaveIcon,
  SplitViewIcon,
  StrikeIcon,
  TableIcon,
  TaskListIcon,
} from "./toolbar-icons";
import styles from "./Toolbar.module.css";

type ToolbarProps = {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  canFormat: boolean;
  onFormat: (action: FormatAction) => void;
  onImage: () => void;
  imageDisabled: boolean;
  state: AutosaveState;
  onSave: () => void;
};

type FormatButton = { action: FormatAction; label: string; icon: ReactNode };

const INLINE: FormatButton[] = [
  { action: "bold", label: "Negrito", icon: <BoldIcon /> },
  { action: "italic", label: "Itálico", icon: <ItalicIcon /> },
  { action: "strike", label: "Tachado", icon: <StrikeIcon /> },
];
const BLOCKS: FormatButton[] = [
  { action: "hr", label: "Linha horizontal", icon: <RuleIcon /> },
  { action: "ul", label: "Lista com marcadores", icon: <BulletListIcon /> },
  { action: "ol", label: "Lista numerada", icon: <NumberedListIcon /> },
  { action: "task", label: "Lista de tarefas", icon: <TaskListIcon /> },
  { action: "quote", label: "Citação", icon: <QuoteIcon /> },
];
const LINK: FormatButton = { action: "link", label: "Link", icon: <LinkIcon /> };
const INSERTS: FormatButton[] = [
  { action: "code", label: "Código", icon: <CodeIcon /> },
  { action: "formula", label: "Fórmula", icon: <FormulaIcon /> },
  { action: "table", label: "Tabela", icon: <TableIcon /> },
];
const HEADINGS = [
  { action: "h1", label: "H1" },
  { action: "h2", label: "H2" },
  { action: "h3", label: "H3" },
] as const satisfies ReadonlyArray<{ action: FormatAction; label: string }>;

/** Impede que o botão tire o foco (e a seleção) da textarea. */
function keepFocus(event: MouseEvent) {
  event.preventDefault();
}

export function saveStatusText(state: AutosaveState): string {
  switch (state.status) {
    case "idle":
      return "";
    case "dirty":
      return "● Alterações não salvas";
    case "saving":
      return "Salvando…";
    case "saved":
      return state.savedAt ? `Salvo às ${formatTime(state.savedAt)}` : "Salvo";
    case "retrying":
      return "Falha ao salvar. Tentando de novo…";
    case "failed":
      return "Não salvo";
    case "invalid":
      return CONTENT_LIMIT_MESSAGE;
  }
}

function formatTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function Toolbar({
  mode,
  onModeChange,
  canFormat,
  onFormat,
  onImage,
  imageDisabled,
  state,
  onSave,
}: ToolbarProps) {
  const disabled = !canFormat;

  function formatButton({ action, label, icon }: FormatButton) {
    return (
      <ToolButton key={action} label={label} disabled={disabled} onClick={() => onFormat(action)}>
        {icon}
      </ToolButton>
    );
  }

  const statusText = saveStatusText(state);
  const statusClass =
    state.status === "failed" || state.status === "retrying" || state.status === "invalid"
      ? styles.statusError
      : state.status === "dirty"
        ? styles.statusDirty
        : "";

  return (
    // `data-keep-editing`: levar o foco da textarea para a barra não encerra a edição.
    // `mousedown` cancelado em toda a barra (botões de modo e fundo também): clicar nela não tira o
    // foco do texto; no Safari, que não foca botões no clique, o foco iria para o documento.
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label="Barra de ferramentas"
      data-keep-editing=""
      onMouseDown={keepFocus}
    >
      <div className={styles.scroller}>
        <div className={styles.group}>{INLINE.map(formatButton)}</div>
        <span className={styles.separator} aria-hidden="true" />
        <div className={styles.group}>
          <HeadingMenu disabled={disabled} onSelect={onFormat} />
          {BLOCKS.map(formatButton)}
        </div>
        <span className={styles.separator} aria-hidden="true" />
        <div className={styles.group}>
          {formatButton(LINK)}
          <ToolButton label="Imagem" disabled={disabled || imageDisabled} onClick={onImage}>
            <ImageIcon />
          </ToolButton>
          {INSERTS.map(formatButton)}
        </div>
        <span className={styles.separator} aria-hidden="true" />
        <div className={styles.group}>
          <ToolButton
            label="Visualização dividida"
            pressed={mode === "split"}
            onClick={() => onModeChange(mode === "split" ? "default" : "split")}
          >
            <SplitViewIcon />
          </ToolButton>
          <ToolButton
            label="Visualização (preview)"
            pressed={mode === "preview"}
            onClick={() => onModeChange(mode === "preview" ? "default" : "preview")}
          >
            <PreviewIcon />
          </ToolButton>
        </div>
        <div className={styles.end}>
          <span role="status" aria-live="polite" className={`${styles.status} ${statusClass}`}>
            {statusText}
          </span>
          <button
            type="button"
            className={styles.save}
            title="Salvar"
            aria-label="Salvar"
            onMouseDown={keepFocus}
            onClick={onSave}
          >
            <SaveIcon />
            <span className={styles.saveText}>Salvar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type ToolButtonProps = {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolButton({ label, disabled, pressed, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

type HeadingMenuProps = {
  disabled: boolean;
  onSelect: (action: FormatAction) => void;
};

function HeadingMenu({ disabled, onSelect }: HeadingMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusFirstRef = useRef(false);

  // Desabilitar (sair da edição) fecha o menu de vez, em vez de só escondê-lo.
  if (disabled && open) setOpen(false);
  const isOpen = open && !disabled;

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: PointerEvent | globalThis.MouseEvent) {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      setOpen(false);
    }
    // Fase de captura: o Esc fecha só o menu e não chega à textarea (que sairia da edição).
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const returnFocus = menuRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    }
    function close() {
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && focusFirstRef.current) {
      focusFirstRef.current = false;
      menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
    }
  }, [isOpen]);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    if (isOpen) {
      setOpen(false);
      return;
    }
    // A barra rola na horizontal: o menu usa posição fixa para não ser cortado.
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
    // `detail === 0`: aberto pelo teclado, então o foco vai para o primeiro item.
    focusFirstRef.current = event.detail === 0;
    setOpen(true);
  }

  function select(action: FormatAction) {
    const returnFocus = menuRef.current?.contains(document.activeElement) ?? false;
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
    onSelect(action);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    else if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    else if (event.key === "End") next = items.length - 1;
    items[next]?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.button}
        title="Título"
        aria-label="Título"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={toggle}
      >
        <HeadingIcon />
      </button>
      {isOpen ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Título"
          className={styles.menu}
          style={position ? { top: position.top, left: position.left } : undefined}
          onKeyDown={handleMenuKeyDown}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && (menuRef.current?.contains(next) || triggerRef.current?.contains(next))) return;
            if (next) setOpen(false);
          }}
        >
          {HEADINGS.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`${styles.menuItem} ${styles[action]}`}
              onMouseDown={keepFocus}
              onClick={() => select(action)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
