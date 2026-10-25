import { EditIcon, TrashIcon } from "@/components/ui/icons";
import type { StudyRecordRow } from "../list";
import styles from "./RowActions.module.css";

type RowActionsProps = {
  record: StudyRecordRow;
  onEdit: (record: StudyRecordRow) => void;
  onDelete: (record: StudyRecordRow) => void;
  className?: string;
};

export function RowActions({ record, onEdit, onDelete, className }: RowActionsProps) {
  return (
    <div className={`${styles.actions} ${className ?? ""}`}>
      <button type="button" className={styles.btn} title="Editar" aria-label="Editar registro" onClick={(event) => {
          event.stopPropagation();
          onEdit(record);
        }}>
        <EditIcon />
        <span>Editar</span>
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.danger}`}
        title="Excluir"
        aria-label="Excluir registro"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(record);
        }}
      >
        <TrashIcon />
        <span>Excluir</span>
      </button>
    </div>
  );
}
