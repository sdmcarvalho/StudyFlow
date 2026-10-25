"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, BookmarkCheckIcon, CalendarIcon, DocumentIcon } from "@/components/ui/icons";
import styles from "./Sidebar.module.css";

const ITEMS = [
  { href: "/estudo", label: "Estudo", Icon: BookIcon },
  { href: "/testes", label: "Testes", Icon: BookmarkCheckIcon },
  { href: "/agenda", label: "Agenda", Icon: CalendarIcon },
];

type SidebarProps = { id: string; open: boolean; onNavigate: () => void };

export function Sidebar({ id, open, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside id={id} className={`${styles.sidebar} ${open ? styles.open : ""}`}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          <DocumentIcon />
        </span>
        <span className={styles.brandName}>StudyFlow</span>
      </div>

      <nav className={styles.nav} aria-label="Navegação principal">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.item} ${active ? styles.active : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
            >
              <span className={styles.icon} aria-hidden="true">
                <Icon />
              </span>
              <span className={styles.label}>{label}</span>
              <span className={styles.tooltip} role="tooltip">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
