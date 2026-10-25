import { CloseIcon, DocumentIcon, MenuIcon } from "@/components/ui/icons";
import styles from "./Topbar.module.css";

type TopbarProps = { open: boolean; controlsId: string; onToggle: () => void };

export function Topbar({ open, controlsId, onToggle }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={styles.menuButton}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls={controlsId}
        onClick={onToggle}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          <DocumentIcon />
        </span>
        <span>StudyFlow</span>
      </div>
    </header>
  );
}
