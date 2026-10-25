import Link from "next/link";
import { formatDateBR } from "@/lib/dates";
import type { StudyRecordRow } from "../list";
import { RowActions } from "./RowActions";
import styles from "./StudyCardList.module.css";

type StudyCardListProps = {
  items: StudyRecordRow[];
  onOpen: (record: StudyRecordRow) => void;
  onEdit: (record: StudyRecordRow) => void;
  onDelete: (record: StudyRecordRow) => void;
};

export function StudyCardList({ items, onOpen, onEdit, onDelete }: StudyCardListProps) {
  return (
    <ul className={styles.list}>
      {items.map((record) => (
        <li
          key={record.id}
          className={styles.card}
          tabIndex={0}
          aria-label={record.descricao}
          onClick={() => onOpen(record)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target === event.currentTarget) onOpen(record);
          }}
        >
          <p className={styles.title}>
            <Link
              href={`/estudo/${encodeURIComponent(record.id)}`}
              className={styles.link}
              onClick={(event) => event.stopPropagation()}
            >
              {record.descricao}
            </Link>
          </p>
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
