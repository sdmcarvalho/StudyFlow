"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { clearAudios } from "../actions";
import styles from "./CleanupPanel.module.css";

const CLEAR_FAILED = "Não foi possível limpar os áudios.";

/** "1,5 MB": B, KB ou MB com vírgula decimal. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const [value, unit] = bytes < 1024 * 1024 ? [bytes / 1024, "KB"] : [bytes / (1024 * 1024), "MB"];
  return `${value.toFixed(1).replace(".", ",")} ${unit}`;
}

function summary(files: number, bytes: number): string {
  if (files === 0) return "Não havia áudios para apagar.";
  return `${files} ${files === 1 ? "arquivo apagado" : "arquivos apagados"} (${formatBytes(bytes)}).`;
}

/** Painel "Limpeza" da Configuração. Só o superusuário o recebe (a página decide). */
export function CleanupPanel() {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // O estado só desabilita o botão no próximo render; o ref barra o segundo clique do mesmo instante.
  const busyRef = useRef(false);

  const close = () => {
    setError(null);
    setOpen(false);
  };

  const handleConfirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await clearAudios();
      if (response.ok) {
        setResult(summary(response.data.files, response.data.bytes));
        setOpen(false);
      } else {
        setError(response.message || CLEAR_FAILED);
      }
    } catch {
      setError(CLEAR_FAILED);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="cleanup-title">
      <h2 id="cleanup-title" className={styles.title}>
        Limpeza
      </h2>
      <p className={styles.hint}>Apaga os áudios de voz gerados e guardados no servidor.</p>
      <Button
        variant="secondary"
        icon={<TrashIcon />}
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
      >
        Limpar Audios
      </Button>
      <p className={styles.result} role="status">
        {result}
      </p>

      <Modal
        open={open}
        title="Limpar áudios"
        role="alertdialog"
        onClose={busy ? () => {} : close}
        initialFocusRef={confirmRef}
      >
        <p className={styles.desc}>
          Apagar todos os áudios gerados? Isso não afeta os Estudos; os áudios são gerados de novo quando
          necessário. Leituras e gravações em andamento de qualquer usuário serão canceladas.
        </p>
        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button ref={confirmRef} variant="danger" icon={<TrashIcon />} disabled={busy} onClick={handleConfirm}>
            {busy ? "Apagando..." : "Apagar"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
