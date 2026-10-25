"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clampWidth, MAX_WIDTH, MIN_WIDTH } from "../image-width";
import styles from "./ImageResizer.module.css";

const KEY_STEP = 10;

type ImageResizerProps = {
  /** Largura atual da imagem, em px. */
  width: number;
  /** Largura final: só ao soltar a alça, ou a cada tecla. */
  onResize: (width: number) => void;
  /** Largura durante o arrasto (`null` quando ele termina), para a imagem acompanhar. */
  onLiveWidth?: (width: number | null) => void;
};

type DragState = { pointerId: number; startX: number; startWidth: number; current: number | null };

/** Ajuste de largura pelas teclas `+`/`=` e `-` (e setas na alça). `null` para outras teclas. */
export function keyResizeDelta(key: string): number | null {
  if (key === "+" || key === "=") return KEY_STEP;
  if (key === "-") return -KEY_STEP;
  return null;
}

/** Alça no canto inferior direito da imagem selecionada. Funciona com mouse, toque e teclado. */
export function ImageResizer({ width, onResize, onLiveWidth }: ImageResizerProps) {
  const dragRef = useRef<DragState | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? width;
  const onLiveWidthRef = useRef(onLiveWidth);

  useEffect(() => {
    onLiveWidthRef.current = onLiveWidth;
  });

  // Desmontar no meio do arrasto (seleção desfeita, texto trocado) não deixa a imagem presa na largura ao vivo.
  useEffect(() => {
    return () => {
      if (dragRef.current?.current != null) onLiveWidthRef.current?.(null);
      dragRef.current = null;
    };
  }, []);

  function updateLive(next: number | null) {
    setLive(next);
    onLiveWidth?.(next);
  }

  function handlePointerDown(event: PointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    if (typeof target.setPointerCapture === "function") {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Ponteiro já liberado: o arrasto segue pelos eventos do próprio elemento.
      }
    }
    target.focus();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, current: null };
  }

  function handlePointerMove(event: PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.current = clampWidth(drag.startWidth + event.clientX - drag.startX);
    updateLive(drag.current);
  }

  function finish(event: PointerEvent<HTMLSpanElement>, commit: boolean) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const final = drag.current;
    updateLive(null);
    if (commit && final !== null && final !== drag.startWidth) onResize(final);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    let delta = keyResizeDelta(event.key);
    if (event.key === "ArrowRight" || event.key === "ArrowUp") delta = KEY_STEP;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") delta = -KEY_STEP;
    if (delta === null) return;
    event.preventDefault();
    event.stopPropagation();
    onResize(clampWidth(width + delta));
  }

  return (
    <>
      <span
        role="slider"
        tabIndex={0}
        aria-label="Redimensionar imagem"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={shown}
        aria-valuetext={`${shown} px`}
        title="Arraste para mudar a largura"
        className={styles.handle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finish(event, true)}
        onPointerCancel={(event) => finish(event, false)}
        onLostPointerCapture={(event) => finish(event, true)}
        onKeyDown={handleKeyDown}
      />
      {live !== null ? (
        <span className={styles.badge} aria-hidden="true">
          {live} px
        </span>
      ) : null}
    </>
  );
}
