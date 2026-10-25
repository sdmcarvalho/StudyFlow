import { CloseIcon, SearchIcon } from "./icons";
import styles from "./SearchField.module.css";

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  label?: string;
};

export function SearchField({ value, onChange, onClear, label = "Pesquisar registros de estudo" }: SearchFieldProps) {
  return (
    <div className={styles.field}>
      <SearchIcon />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Pesquisar..."
        aria-label={label}
        autoComplete="off"
      />
      {value.length > 0 ? (
        <button type="button" className={styles.clear} onClick={onClear} aria-label="Limpar pesquisa">
          <CloseIcon />
        </button>
      ) : null}
    </div>
  );
}
