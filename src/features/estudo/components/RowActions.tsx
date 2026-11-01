import Link from "next/link";
import { EditIcon, MicIcon, TrashIcon } from "@/components/ui/icons";
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
      {/* O clique não sobe até a linha (que abriria o editor); o Enter também não: a linha só trata o Enter
          quando ela mesma tem o foco. */}
      <Link
        href={`/estudo/${encodeURIComponent(record.id)}/voz`}
        className={styles.btn}
        title="Voz"
        aria-label="Voz do registro"
        onClick={(event) => event.stopPropagation()}
      >
        <MicIcon />
        <span>Voz</span>
      </Link>
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
