"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { deleteUser } from "../actions";
import type { UserRow } from "../types";
import { FormActions, FormField, fieldProps } from "./FormField";
import styles from "./DeleteUserModal.module.css";

const DELETE_FAILED = "Não foi possível excluir. Tente novamente.";

const normalize = (value: string) => value.trim().toLowerCase();
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

type DeleteUserModalProps = {
  user: UserRow | null;
  onClose: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

export function DeleteUserModal({ user, onClose, onDeleted, onError }: DeleteUserModalProps) {
  return (
    <Modal open={user !== null} title="Excluir usuário" role="alertdialog" onClose={onClose}>
      {user ? <DeleteForm user={user} onCancel={onClose} onDeleted={onDeleted} onError={onError} /> : null}
    </Modal>
  );
}

type DeleteFormProps = {
  user: UserRow;
  onCancel: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

function DeleteForm({ user, onCancel, onDeleted, onError }: DeleteFormProps) {
  const base = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  // Só habilita "Excluir" quando o e-mail digitado confere (sem diferenciar maiúsculas nem espaços nas pontas).
  const matches = user.email !== "" && normalize(typed) === normalize(user.email);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matches || pending) return;
    setError(undefined);
    setPending(true);
    try {
      const result = await deleteUser(user.id, typed);
      if (result.ok) onDeleted();
      else if (result.fieldErrors?.emailConfirmacao) setError(result.fieldErrors.emailConfirmacao);
      else onError(result.message ?? DELETE_FAILED);
    } catch {
      onError(DELETE_FAILED);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className={styles.desc}>
        Excluir <strong>{user.name}</strong> apaga para sempre a conta e tudo o que ela tem:{" "}
        {plural(user.studyCount, "estudo", "estudos")}, {plural(user.cardCount, "card", "cards")} e{" "}
        {plural(user.scheduleCount, "agendamento", "agendamentos")} (além do que estiver na lixeira). As pastas no
        disco não são apagadas. Essa ação não pode ser desfeita.
      </p>
      <FormField id={`${base}-email`} label={`Digite o e-mail ${user.email} para confirmar`} error={error}>
        <input
          {...fieldProps(`${base}-email`, error)}
          name="emailConfirmacao"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </FormField>
      <FormActions>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="danger" type="submit" icon={<TrashIcon />} disabled={!matches || pending}>
          Excluir
        </Button>
      </FormActions>
    </form>
  );
}
