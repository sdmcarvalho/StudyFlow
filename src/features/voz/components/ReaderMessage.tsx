import Link from "next/link";
import styles from "./ReaderView.module.css";

type ReaderMessageProps = {
  studyId: string;
  /** Mensagens em pt-BR, mostradas como estão. */
  messages: string[];
};

/** Tela Ler sem nada para tocar: mostra o motivo e o caminho de volta à tela Voz (sem corrigir valores). */
export function ReaderMessage({ studyId, messages }: ReaderMessageProps) {
  return (
    <section className={styles.message} aria-labelledby="ler-title">
      <h2 id="ler-title" className={styles.title}>
        Ler
      </h2>
      {messages.map((message) => (
        <p key={message} className={styles.messageText} role="alert">
          {message}
        </p>
      ))}
      <Link href={`/estudo/${encodeURIComponent(studyId)}/voz`} className={styles.back}>
        Voltar
      </Link>
    </section>
  );
}
