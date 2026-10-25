import { formatDateBR } from "@/lib/dates";
import type { StudyRecordRow } from "../list";
import { RowActions } from "./RowActions";
import styles from "./StudyCardList.module.css";

type StudyCardListProps = {
  items: StudyRecordRow[];
  onEdit: (record: StudyRecordRow) => void;
  onDelete: (record: StudyRecordRow) => void;
};

export function StudyCardList({ items, onEdit, onDelete }: StudyCardListProps) {
  return (
    <ul className={styles.list}>
      {items.map((record) => (
        <li key={record.id} className={styles.card}>
          <p className={styles.title}>{record.descricao}</p>
          <div className={styles.meta}>
            <div className={`${styles.field} ${styles.full}`}>
              <span className={styles.label}>Pasta</span>
              <span className={`${styles.value} ${styles.truncate}`}>{record.pasta}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Data inicial</span>
              <span className={styles.value}>{formatDateBR(record.dataInicial)}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Atualização</span>
              <span className={styles.value}>{formatDateBR(record.dataAtualizacao)}</span>
            </div>
          </div>
          <RowActions record={record} onEdit={onEdit} onDelete={onDelete} className={styles.actions} />
        </li>
      ))}
    </ul>
  );
}
