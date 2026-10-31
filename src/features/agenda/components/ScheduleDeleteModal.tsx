"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { formatDateBR } from "@/lib/dates";
import { deleteSchedule } from "../actions";
import type { ScheduleRow } from "../types";
import styles from "./ScheduleDeleteModal.module.css";

type ScheduleDeleteModalProps = {
  schedule: ScheduleRow | null;
  onClose: () => void;
  /** Chamado depois de a exclusão dar certo (a lista recarrega os dados). */
  onDeleted: () => void;
};

const DELETE_ERROR = "Não foi possível excluir o agendamento.";

export function ScheduleDeleteModal({ schedule, onClose, onDeleted }: ScheduleDeleteModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // O estado só desabilita o botão no próximo render; o ref barra o segundo clique do mesmo instante.
  const deletingRef = useRef(false);

  const close = () => {
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!schedule || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteSchedule(schedule.id);
      if (result.ok) {
        onDeleted();
        onClose();
      } else {
        setError(result.message || DELETE_ERROR);
      }
    } catch {
      setError(DELETE_ERROR);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={schedule !== null}
      title="Excluir agendamento"
      role="alertdialog"
      onClose={deleting ? () => {} : close}
      initialFocusRef={confirmRef}
    >
      <p className={styles.desc}>
        Excluir o agendamento “{schedule?.session}” de {schedule ? formatDateBR(schedule.reviewDate) : ""} do estudo “
        {schedule?.studyName}”? Essa ação não pode ser desfeita.
      </p>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={close} disabled={deleting}>
          Cancelar
        </Button>
        <Button ref={confirmRef} variant="danger" icon={<TrashIcon />} disabled={deleting} onClick={handleConfirm}>
          {deleting ? "Excluindo..." : "Excluir"}
        </Button>
      </div>
    </Modal>
  );
}
