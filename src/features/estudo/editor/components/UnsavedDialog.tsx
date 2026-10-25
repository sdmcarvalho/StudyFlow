"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import styles from "./UnsavedDialog.module.css";

type UnsavedDialogProps = {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
};

export function UnsavedDialog({ open, onStay, onLeave }: UnsavedDialogProps) {
  const stayRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal open={open} title="Sair sem salvar?" role="alertdialog" onClose={onStay} initialFocusRef={stayRef}>
      <p className={styles.desc}>Há alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.</p>
      <div className={styles.actions}>
        <Button ref={stayRef} variant="secondary" onClick={onStay}>
          Continuar editando
        </Button>
        <Button variant="danger" onClick={onLeave}>
          Sair sem salvar
        </Button>
      </div>
    </Modal>
  );
}
