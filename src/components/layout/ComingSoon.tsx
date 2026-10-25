import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "./PageHeader";
import styles from "./ComingSoon.module.css";

type ComingSoonProps = { title: string; icon: ReactNode };

export function ComingSoon({ title, icon }: ComingSoonProps) {
  return (
    <>
      <PageHeader title={title} />
      <section className={styles.panel}>
        <EmptyState icon={icon} title="Em breve" description="Esta área ainda está em construção." />
      </section>
    </>
  );
}
