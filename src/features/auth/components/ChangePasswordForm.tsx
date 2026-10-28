"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { changePasswordAction } from "../actions";
import styles from "./ChangePasswordForm.module.css";

const CHANGE_FAILED = "Não foi possível alterar a senha. Tente novamente.";

type FieldErrors = { senhaAtual?: string; novaSenha?: string; confirmacao?: string };

export function ChangePasswordForm() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const result = await changePasswordAction({ senhaAtual, novaSenha, confirmacao });
      if (result.ok) {
        // As senhas não ficam na tela nem no estado depois da troca.
        setSenhaAtual("");
        setNovaSenha("");
        setConfirmacao("");
        show("Senha alterada.");
      } else if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      } else {
        setMessage(result.message ?? CHANGE_FAILED);
      }
    } catch {
      setMessage(CHANGE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="account-title">
      <h2 id="account-title" className={styles.title}>
        Minha conta
      </h2>
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <Field id="account-senha-atual" label="Senha atual" error={errors.senhaAtual}>
          <input
            id="account-senha-atual"
            name="senhaAtual"
            type="password"
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(event) => setSenhaAtual(event.target.value)}
            {...describe("account-senha-atual", errors.senhaAtual)}
          />
        </Field>

        <Field id="account-nova-senha" label="Nova senha" error={errors.novaSenha}>
          <input
            id="account-nova-senha"
            name="novaSenha"
            type="password"
            autoComplete="new-password"
            value={novaSenha}
            onChange={(event) => setNovaSenha(event.target.value)}
            {...describe("account-nova-senha", errors.novaSenha)}
          />
        </Field>

        <Field id="account-confirmacao" label="Confirmar nova senha" error={errors.confirmacao}>
          <input
            id="account-confirmacao"
            name="confirmacao"
            type="password"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(event) => setConfirmacao(event.target.value)}
            {...describe("account-confirmacao", errors.confirmacao)}
          />
        </Field>

        {message ? (
          <p className={styles.message} role="alert">
            {message}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button variant="primary" type="submit" disabled={busy}>
            Alterar senha
          </Button>
        </div>
      </form>
      <Toast message={toast?.message ?? ""} visible={toast !== null} />
    </section>
  );
}

/** Atributos de acessibilidade do campo: erro ligado por aria-describedby. */
function describe(id: string, error: string | undefined) {
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

type FieldProps = { id: string; label: string; error?: string; children: ReactNode };

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
