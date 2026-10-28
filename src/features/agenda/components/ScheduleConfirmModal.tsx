"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDateBR } from "@/lib/dates";
import styles from "./ScheduleConfirmModal.module.css";
type SchedulePreview = {
reviewDate: string;
studyName: string;
createdAt: string;
session: string;
};
type ScheduleConfirmModalProps = {
open: boolean;
studyId: string;
studyName: string;
onClose: () => void;
onConfirm: () => Promise<void>;
};
export function ScheduleConfirmModal({ open, studyId, studyName, onClose, onConfirm }: ScheduleConfirmModalProps) {
const [confirming, setConfirming] = useState(false);
const [error, setError] = useState<string | null>(null);
// Calcula as datas de revisão
const now = new Date();
const today = now.toISOString().split("T")[0];
const sessions: SchedulePreview[] = [
{ reviewDate: addToDate(now, 0), studyName, createdAt: today, session: "Imediata" },
{ reviewDate: addToDate(now, 1), studyName, createdAt: today, session: "24 horas" },
{ reviewDate: addToDate(now, 3), studyName, createdAt: today, session: "3 dias" },
{ reviewDate: addToDate(now, 7), studyName, createdAt: today, session: "1 semana" },
{ reviewDate: addToDate(now, 30), studyName, createdAt: today, session: "1 mês" },
{ reviewDate: addToDate(now, 180), studyName, createdAt: today, session: "6 meses" },
];
function addToDate(date: Date, days: number): string {
const newDate = new Date(date);
newDate.setDate(newDate.getDate() + days);
return newDate.toISOString().split("T")[0];
}
const handleConfirm = async () => {
setConfirming(true);
setError(null);
try {
await onConfirm();
onClose();
} catch (err) {
setError("Não foi possível criar os agendamentos. Tente novamente.");
} finally {
setConfirming(false);
}
};
if (!open) return null;
return (
<Modal open={open} title="Confirmar Agendamentos" onClose={onClose}>
<div className={styles.modal}>
<p>Os seguintes agendamentos serão criados para o estudo <strong>{studyName}</strong>:</p>
<table className={styles.table}>
<thead>
<tr>
<th>Data Revisão</th>
<th>Sessão</th>
</tr>
</thead>
<tbody>
{sessions.map((s, i) => (
<tr key={i}>
<td>{formatDateBR(s.reviewDate)}</td>
<td>{s.session}</td>
</tr>
))}
</tbody>
</table>
{error && <div className={styles.warning}>{error}</div>}
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