import type { ReactNode } from "react";
import styles from "./FormField.module.css";

type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

/** Rótulo, campo, dica e erro de um formulário dos modais de Usuários. O campo usa `fieldProps` para ligar os dois. */
export function FormField({ id, label, error, hint, children }: FormFieldProps) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error ? (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Atributos de acessibilidade do campo: erro (ou dica) ligado por aria-describedby. */
export function fieldProps(id: string, error: string | undefined, hint?: string) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return {
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
  };
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
