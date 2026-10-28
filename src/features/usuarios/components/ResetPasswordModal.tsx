"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { resetUserPassword } from "../actions";
import type { UserRow } from "../types";
import { FormActions, FormField, fieldProps } from "./FormField";
import styles from "./ResetPasswordModal.module.css";

const SAVE_FAILED = "Não foi possível salvar. Tente novamente.";

type ResetPasswordModalProps = {
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
};

export function ResetPasswordModal({ user, onClose, onSaved, onError }: ResetPasswordModalProps) {
  return (
    <Modal open={user !== null} title="Redefinir senha" onClose={onClose}>
      {user ? <ResetForm user={user} onCancel={onClose} onSaved={onSaved} onError={onError} /> : null}
    </Modal>
  );
}

type ResetFormProps = {
  user: UserRow;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
};

function ResetForm({ user, onCancel, onSaved, onError }: ResetFormProps) {
  const base = useId();
  const [novaSenha, setNovaSenha] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      const result = await resetUserPassword(user.id, { novaSenha });
      if (result.ok) onSaved();
      else if (result.fieldErrors?.novaSenha) setError(result.fieldErrors.novaSenha);
      else onError(result.message ?? SAVE_FAILED);
    } catch {
      onError(SAVE_FAILED);
    } finally {
      setPending(false);
    }
  }

  const hint = "Mínimo de 8 caracteres, com letra e número.";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className={styles.desc}>
        Defina uma nova senha para <strong>{user.name}</strong>. As sessões abertas desse usuário serão encerradas.
      </p>
      <FormField id={`${base}-senha`} label="Nova senha" error={error} hint={hint}>
        <input
          {...fieldProps(`${base}-senha`, error, hint)}
          name="novaSenha"
          type="password"
          autoComplete="new-password"
          value={novaSenha}
          onChange={(event) => setNovaSenha(event.target.value)}
        />
      </FormField>
      <FormActions>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={pending}>
          Redefinir
        </Button>
      </FormActions>
    </form>
  );
}
