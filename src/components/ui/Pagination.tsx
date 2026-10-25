import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import styles from "./Pagination.module.css";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={styles.pagination}>
      <button
        type="button"
        className={styles.btn}
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeftIcon />
      </button>
      <span className={styles.page}>
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        className={styles.btn}
        aria-label="Próxima página"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}
