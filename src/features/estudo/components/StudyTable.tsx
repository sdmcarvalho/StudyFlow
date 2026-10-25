import { formatDateBR } from "@/lib/dates";
import type { StudyRecordRow } from "../list";
import { RowActions } from "./RowActions";
import styles from "./StudyTable.module.css";

type StudyTableProps = {
  items: StudyRecordRow[];
  onEdit: (record: StudyRecordRow) => void;
  onDelete: (record: StudyRecordRow) => void;
};

export function StudyTable({ items, onEdit, onDelete }: StudyTableProps) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Descrição</th>
            <th scope="col">Pasta</th>
            <th scope="col">Data inicial</th>
            <th scope="col">Data atualização</th>
            <th scope="col" className={styles.actionsHead}>
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((record) => (
            <tr key={record.id}>
              <td className={styles.descricao}>
                <span className={styles.truncate} title={record.descricao}>
                  {record.descricao}
                </span>
              </td>
              <td className={styles.pasta}>
                <span className={styles.truncate} title={record.pasta}>
                  {record.pasta}
                </span>
              </td>
              <td className={styles.data}>{formatDateBR(record.dataInicial)}</td>
              <td className={styles.data}>{formatDateBR(record.dataAtualizacao)}</td>
              <td>
                <RowActions record={record} onEdit={onEdit} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
