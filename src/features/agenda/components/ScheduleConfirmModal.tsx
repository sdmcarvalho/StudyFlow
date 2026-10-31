"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDateBR } from "@/lib/dates";
import { REVIEW_SESSIONS, reviewDateFor } from "../sessions";
import styles from "./ScheduleConfirmModal.module.css";

type ConfirmResult = { ok: true } | { ok: false; message: string };

type ScheduleConfirmModalProps = {
  open: boolean;
  studyId: string;
  studyName: string;
  warning?: string;
  onClose: () => void;
  onConfirm: () => Promise<ConfirmResult>;
};

const CONFIRM_ERROR = "Não foi possível criar os agendamentos. Tente novamente.";

export function ScheduleConfirmModal({ open, studyName, warning, onClose, onConfirm }: ScheduleConfirmModalProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // O estado só desabilita o botão no próximo render; o ref barra o segundo clique do mesmo instante.
  const confirmingRef = useRef(false);

  const handleConfirm = async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result.ok) {
        onClose();
      } else {
        setError(result.message || CONFIRM_ERROR);
      }
    } catch {
      setError(CONFIRM_ERROR);
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  };

  if (!open) return null;

  const now = new Date();

  return (
    <Modal open={open} title="Confirmar Agendamentos" onClose={confirming ? () => {} : onClose}>
      <div className={styles.modal}>
        <p>
          Os seguintes agendamentos serão criados para o estudo <strong>{studyName}</strong>:
        </p>
        {warning && <div className={styles.warning}>{warning}</div>}
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Data Revisão</th>
              <th>Sessão</th>
            </tr>
          </thead>
          <tbody>
            {REVIEW_SESSIONS.map(({ session, days }) => (
              <tr key={session}>
                <td>{formatDateBR(reviewDateFor(now, days))}</td>
                <td>{session}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && (
          <div role="alert" className={styles.warning}>
            {error}
          </div>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={confirming}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={confirming}>
            {confirming ? "Criando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
