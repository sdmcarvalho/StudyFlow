"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Toast.module.css";

const TOAST_DURATION_MS = 5000;

type ToastState = { message: string; onUndo?: () => void };

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, onUndo?: () => void) => {
    clearTimeout(timer.current);
    setToast({ message, onUndo });
    timer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { toast, show, hide };
}

type ToastProps = { message: string; visible: boolean; onUndo?: () => void };

export function Toast({ message, visible, onUndo }: ToastProps) {
  // Mantém o último texto durante o fade-out, quando a mensagem já foi limpa.
  const [text, setText] = useState(message);
  if (message && message !== text) setText(message);

  return (
    <div className={`${styles.toast} ${visible ? styles.visible : ""}`} role="status" aria-live="polite">
      <span>{text}</span>
      {visible && onUndo ? (
        <button type="button" className={styles.undo} onClick={onUndo}>
          Desfazer
        </button>
      ) : null}
    </div>
  );
}
