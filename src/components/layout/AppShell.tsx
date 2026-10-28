"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ShellUser } from "@/features/auth/types";
import styles from "./AppShell.module.css";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const TABLET_MIN_WIDTH = 768;
const SIDEBAR_ID = "sidebar";

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= TABLET_MIN_WIDTH) setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className={styles.shell}>
      <Sidebar
        id={SIDEBAR_ID}
        open={drawerOpen}
        onNavigate={() => setDrawerOpen(false)}
        isSuper={user.role === "SUPER"}
      />
      <div
        data-testid="sidebar-overlay"
        className={`${styles.overlay} ${drawerOpen ? styles.overlayVisible : ""}`}
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
      />
      <div className={styles.main}>
        <Topbar open={drawerOpen} controlsId={SIDEBAR_ID} onToggle={() => setDrawerOpen((open) => !open)} user={user} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
