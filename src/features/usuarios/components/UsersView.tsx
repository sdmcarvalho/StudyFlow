"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Toast, useToast } from "@/components/ui/Toast";
import { formatDateBR } from "@/lib/dates";
import { setUserActive } from "../actions";
import type { UserRow } from "../types";
import { DeleteUserModal } from "./DeleteUserModal";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { UserFormModal } from "./UserFormModal";
import styles from "./UsersView.module.css";

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

export function UsersView({ users }: { users: UserRow[] }) {
  const { toast, show } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(user: UserRow) {
    setBusyId(user.id);
    try {
      const result = await setUserActive(user.id, !user.active);
      if (result.ok) show(user.active ? "Usuário desativado." : "Usuário reativado.");
      else show(result.message ?? GENERIC_ERROR);
    } catch {
      show(GENERIC_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className={styles.actionBar}>
        <Button variant="primary" icon={<PlusIcon />} onClick={() => setFormOpen(true)}>
          Novo usuário
        </Button>
      </div>

      <section className={styles.panel} aria-live="polite">
        <div className={styles.wrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Criado em</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.actionsHead}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className={styles.name}>
                    <div className={styles.nameCell}>
                      <span className={styles.truncate} title={user.name}>
                        {user.name}
                      </span>
                      {user.role === "SUPER" ? (
                        <span className={`${styles.badge} ${styles.super}`}>Superusuário</span>
                      ) : null}
                    </div>
                  </td>
                  <td className={styles.email}>
                    <span className={styles.truncate} title={user.email}>
                      {user.email}
                    </span>
                  </td>
                  <td className={styles.date}>{formatDateBR(user.createdAt.slice(0, 10))}</td>
                  <td>
                    <span className={`${styles.badge} ${user.active ? styles.active : styles.inactive}`}>
                      {user.active ? "Ativo" : "Desativado"}
                    </span>
                  </td>
                  <td>
                    {user.role === "SUPER" ? null : (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.btn}
                          aria-label={`Redefinir senha de ${user.name}`}
                          onClick={() => setResetting(user)}
                        >
                          Redefinir senha
                        </button>
                        <button
                          type="button"
                          className={styles.btn}
                          aria-label={`${user.active ? "Desativar" : "Reativar"} ${user.name}`}
                          disabled={busyId === user.id}
                          onClick={() => toggleActive(user)}
                        >
                          {user.active ? "Desativar" : "Reativar"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.danger}`}
                          aria-label={`Excluir ${user.name}`}
                          onClick={() => setDeleting(user)}
                        >
                          <TrashIcon />
                          <span>Excluir</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <UserFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          show("Usuário criado.");
        }}
        onError={show}
      />
      <ResetPasswordModal
        user={resetting}
        onClose={() => setResetting(null)}
        onSaved={() => {
          setResetting(null);
          show("Senha redefinida.");
        }}
        onError={show}
      />
      <DeleteUserModal
        user={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          show("Usuário excluído.");
        }}
        onError={show}
      />
      <Toast message={toast?.message ?? ""} visible={toast !== null} />
    </>
  );
}
