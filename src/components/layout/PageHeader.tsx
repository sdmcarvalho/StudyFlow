import styles from "./PageHeader.module.css";

type PageHeaderProps = { title: string; subtitle?: string };

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </div>
  );
}
