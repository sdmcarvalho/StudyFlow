"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import type { StudyRecordRow } from "../list";
import styles from "./DeleteConfirmModal.module.css";

type DeleteConfirmModalProps = {
  record: StudyRecordRow | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmModal({ record, pending, onClose, onConfirm }: DeleteConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={record !== null}
      title="Excluir registro"
      role="alertdialog"
      onClose={onClose}
      initialFocusRef={confirmRef}
    >
      <p className={styles.desc}>Excluir “{record?.descricao}”? Essa ação não pode ser desfeita.</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button ref={confirmRef} variant="danger" icon={<TrashIcon />} disabled={pending} onClick={onConfirm}>
          Excluir
        </Button>
      </div>
    </Modal>
  );
}
