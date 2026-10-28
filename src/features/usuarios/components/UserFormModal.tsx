"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createUser } from "../actions";
import { FormActions, FormField, fieldProps } from "./FormField";

const SAVE_FAILED = "Não foi possível salvar. Tente novamente.";

type FieldErrors = { nome?: string; email?: string; senha?: string };

type UserFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
};

export function UserFormModal({ open, onClose, onSaved, onError }: UserFormModalProps) {
  return (
    <Modal open={open} title="Novo usuário" onClose={onClose}>
      <UserForm onCancel={onClose} onSaved={onSaved} onError={onError} />
    </Modal>
  );
}

type UserFormProps = { onCancel: () => void; onSaved: () => void; onError: (message: string) => void };

// Montado só enquanto o modal está aberto, então o estado reinicia a cada abertura.
function UserForm({ onCancel, onSaved, onError }: UserFormProps) {
  const base = useId();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setPending(true);
    try {
      const result = await createUser({ nome, email, senha });
      if (result.ok) onSaved();
      else if (result.fieldErrors) setErrors(result.fieldErrors);
      else onError(result.message ?? SAVE_FAILED);
    } catch {
      // A chamada em si pode falhar (rede fora, servidor reiniciado): o modal fica aberto com os dados.
      onError(SAVE_FAILED);
    } finally {
      setPending(false);
    }
  }

  const passwordHint = "Mínimo de 8 caracteres, com letra e número.";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormField id={`${base}-nome`} label="Nome" error={errors.nome}>
        <input
          {...fieldProps(`${base}-nome`, errors.nome)}
          name="nome"
          autoComplete="off"
          maxLength={80}
          value={nome}
          onChange={(event) => setNome(event.target.value)}
        />
      </FormField>
      <FormField id={`${base}-email`} label="E-mail" error={errors.email}>
        <input
          {...fieldProps(`${base}-email`, errors.email)}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </FormField>
      <FormField id={`${base}-senha`} label="Senha" error={errors.senha} hint={passwordHint}>
        <input
          {...fieldProps(`${base}-senha`, errors.senha, passwordHint)}
          name="senha"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(event) => setSenha(event.target.value)}
        />
      </FormField>
      <FormActions>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={pending}>
          Criar
        </Button>
      </FormActions>
    </form>
  );
}
