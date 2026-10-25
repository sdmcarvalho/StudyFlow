"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import type { Cell as CellData } from "../../content-schema";
import type { EditorMode } from "../editor-mode";
import { Cell, type CellProps } from "./Cell";
import styles from "./CellList.module.css";

type CellCallbacks = Pick<
  CellProps,
  | "onEdit"
  | "onStopEditing"
  | "onChange"
  | "onAddBelow"
  | "onDelete"
  | "onResizeImage"
  | "registerTextarea"
  | "onFocusCell"
  | "onImageError"
>;

type CellListProps = CellCallbacks & {
  cells: CellData[];
  mode: EditorMode;
  editingId: string | null;
  studyId: string;
  onReorder: (from: number, to: number) => void;
};

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Para mover a célula, pressione Espaço. Use as setas para cima e para baixo para escolher a nova posição. Pressione Espaço de novo para soltar ou Esc para cancelar.",
};

// Mouse precisa andar um pouco antes de arrastar; no toque, segurar por um instante.
const POINTER_ACTIVATION = { activationConstraint: { distance: 6 } };
const TOUCH_ACTIVATION = { activationConstraint: { delay: 200, tolerance: 8 } };
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

export function CellList({ cells, mode, editingId, studyId, onReorder, ...callbacks }: CellListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  );

  const ids = useMemo(() => cells.map((cell) => cell.id), [cells]);
  const total = cells.length;

  const announcements = useMemo<Announcements>(() => {
    const position = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;
    return {
      onDragStart: ({ active }) => `Célula ${position(active.id)} de ${total} selecionada.`,
      onDragOver: ({ active, over }) =>
        over
          ? `Célula ${position(active.id)} sobre a posição ${position(over.id)} de ${total}.`
          : `Célula ${position(active.id)} fora da lista.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `Célula ${position(active.id)} solta na posição ${position(over.id)} de ${total}.`
          : `Célula ${position(active.id)} solta sem mudar de lugar.`,
      onDragCancel: ({ active }) => `Movimento cancelado. Célula ${position(active.id)} voltou ao lugar.`,
    };
  }, [ids, total]);

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  }

  // O preview usa a mesma árvore (só com o arrastar desligado): trocar de modo não remonta as
  // células, então o foco e o estado de cada uma sobrevivem.
  const readOnly = mode === "preview";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements, screenReaderInstructions }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={styles.list}>
          {cells.map((cell, index) => (
            <SortableCell
              key={cell.id}
              cell={cell}
              index={index}
              total={total}
              mode={mode}
              editing={!readOnly && cell.id === editingId}
              studyId={studyId}
              dragDisabled={readOnly}
              {...callbacks}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCell({ dragDisabled, ...props }: Omit<CellProps, "drag"> & { dragDisabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.cell.id,
    attributes: { roleDescription: "célula arrastável" },
    disabled: dragDisabled,
  });

  return (
    <Cell
      {...props}
      drag={{
        setNodeRef,
        setActivatorNodeRef,
        attributes,
        listeners,
        isDragging,
        style: { transform: CSS.Translate.toString(transform), transition },
      }}
    />
  );
}
