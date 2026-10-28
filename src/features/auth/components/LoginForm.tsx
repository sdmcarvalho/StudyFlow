"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { loginAction } from "../actions";
import styles from "./LoginForm.module.css";

const LOGIN_FAILED = "Não foi possível entrar. Tente novamente.";

type FieldErrors = { email?: string; senha?: string };

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const result = await loginAction({ email, senha, next });
      if (result.ok) {
        // O botão continua desabilitado até a navegação terminar, para não enviar duas vezes.
        router.replace(result.data.redirectTo);
        router.refresh();
        return;
      }
      if (result.fieldErrors) setErrors(result.fieldErrors);
      else setMessage(result.message ?? LOGIN_FAILED);
    } catch {
      setMessage(LOGIN_FAILED);
    }
    setBusy(false);
  }

  return (
    <section className={styles.panel} aria-labelledby="login-title">
      <h1 id="login-title" className={styles.title}>
        Entrar
      </h1>
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <Field id="login-email" label="E-mail" error={errors.email}>
          <input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            {...describe("login-email", errors.email)}
          />
        </Field>

        <Field id="login-senha" label="Senha" error={errors.senha}>
          <input
            id="login-senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            {...describe("login-senha", errors.senha)}
          />
        </Field>

        {message ? (
          <p className={styles.message} role="alert">
            {message}
          </p>
        ) : null}

        <Button variant="primary" type="submit" className={styles.submit} disabled={busy}>
          Entrar
        </Button>
      </form>
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
