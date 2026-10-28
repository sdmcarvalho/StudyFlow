"use client";

import { logoutAction } from "@/features/auth/actions";
import styles from "./UserMenu.module.css";

type UserMenuProps = { name: string; email: string };

export function UserMenu({ name, email }: UserMenuProps) {
  return (
    <form action={logoutAction} className={styles.menu}>
      <span className={styles.name} title={email}>
        {name}
      </span>
      <button type="submit" className={styles.logout}>
        Sair
      </button>
    </form>
  );
}
