"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { adjustEnd, audioFileName, defaultRange, MSG_FEW_CELLS, validateRange } from "../range";
import { useVoiceJob } from "../use-voice-job";
import styles from "./VozView.module.css";

const NOT_INSTALLED = "A voz não está instalada neste ambiente.";

type VozViewProps = {
  studyId: string;
  descricao: string;
  /** Quantidade de células do Estudo. */
  total: number;
  /** Há um motor de voz neste ambiente. */
  installed: boolean;
};

/** Inteiro escrito só com dígitos (espaços em volta são aceitos); qualquer outra coisa é `null`. */
function toInt(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

export function VozView({ studyId, descricao, total, installed }: VozViewProps) {
  const initial = defaultRange(total);
  // O estado guarda o texto digitado ("1e2", "2.5", "" aparecem e são recusados), não só o número.
  const [startText, setStartText] = useState(String(initial.start));
  const [endText, setEndText] = useState(String(initial.end));
  // Intervalo que foi enviado ao Gravar: o nome do arquivo baixado usa ele, não o que está nos campos agora.
  const [sent, setSent] = useState<{ start: number; end: number } | null>(null);
  const job = useVoiceJob();

  const fewCells = total < 2;
  const validation = validateRange(startText, endText, total);
  const errors = validation.ok || fewCells ? {} : validation.errors;
  const canAct = installed && !fewCells && validation.ok && !job.busy;
  const fieldsLocked = fewCells || job.busy;
  const studyHref = `/estudo/${encodeURIComponent(studyId)}`;

  function changeStart(text: string) {
    setStartText(text);
    // A final só é reajustada se ficar menor ou igual à inicial (e só quando as duas são inteiros).
    const s = toInt(text);
    const e = toInt(endText);
    if (s !== null && e !== null && e <= s) setEndText(String(adjustEnd(s, e, total)));
  }

  function handleGravar() {
    if (!canAct || !validation.ok) return;
    const range = { start: validation.start, end: validation.end };
    setSent(range);
    void job.start({ studyId, ...range, mode: "gravar" });
  }

  const state = job.status?.state;
  const active = job.busy && (state === "na-fila" || state === "gerando");
  const done = job.status;
  let statusText = "";
  if (job.busy && !job.status) statusText = "Iniciando…";
  else if (state === "na-fila") statusText = "Na fila";
  else if (state === "gerando") statusText = `Gerando… ${done?.feitas ?? 0} de ${done?.total ?? 0} células`;
  else if (state === "pronto") statusText = "Pronto";
  else if (state === "cancelado") statusText = "Geração cancelada.";

  return (
    <section className={styles.panel} aria-labelledby="voz-title">
      <h2 id="voz-title" className={styles.title}>
        Ler ou gravar
      </h2>

      {fewCells ? <p className={styles.notice}>{MSG_FEW_CELLS}</p> : null}
      {installed ? null : <p className={styles.notice}>{NOT_INSTALLED}</p>}

      <div className={styles.form}>
        <ReadOnlyField id="voz-descricao" label="Descrição" value={descricao} />
        <ReadOnlyField id="voz-celulas" label="Células" value={String(total)} />

        <div className={styles.row}>
          <Field id="voz-inicial" label="Célula inicial" error={errors.start}>
            <input
              id="voz-inicial"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={startText}
              onChange={(event) => changeStart(event.target.value)}
              disabled={fieldsLocked}
              {...describe("voz-inicial", errors.start)}
            />
          </Field>
          <Field id="voz-final" label="Célula final" error={errors.end}>
            <input
              id="voz-final"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={endText}
              onChange={(event) => setEndText(event.target.value)}
              disabled={fieldsLocked}
              {...describe("voz-final", errors.end)}
            />
          </Field>
        </div>

        <div className={styles.actions}>
          <Link href={studyHref} className={styles.back}>
            Voltar ao Estudo
          </Link>
          {canAct && validation.ok ? (
            <Link
              href={`${studyHref}/voz/ler?de=${validation.start}&ate=${validation.end}`}
              className={`${styles.action} ${styles.secondary}`}
            >
              Ler
            </Link>
          ) : (
            <span aria-disabled="true" className={`${styles.action} ${styles.secondary} ${styles.disabled}`}>
              Ler
            </span>
          )}
          <Button variant="primary" onClick={handleGravar} disabled={!canAct}>
            Gravar
          </Button>
        </div>
      </div>

      <div role="status" className={styles.status}>
        {statusText}
      </div>

      {state === "gerando" && active ? (
        <div
          role="progressbar"
          aria-label="Progresso da gravação"
          aria-valuemin={0}
          aria-valuemax={done?.total ?? 0}
          aria-valuenow={done?.feitas ?? 0}
          className={styles.bar}
        >
          <div
            className={styles.barFill}
            style={{ width: `${done && done.total > 0 ? Math.round((done.feitas / done.total) * 100) : 0}%` }}
          />
        </div>
      ) : null}

      {active ? (
        <div className={styles.jobActions}>
          <Button variant="secondary" onClick={() => void job.cancel()}>
            Cancelar
          </Button>
        </div>
      ) : null}

      {state === "pronto" && done && sent ? (
        <div className={styles.jobActions}>
          <a
            href={`/api/voz/jobs/${encodeURIComponent(done.id)}/download`}
            download={audioFileName(descricao, sent.start, sent.end)}
            className={`${styles.action} ${styles.primary}`}
          >
            Baixar MP3
          </a>
        </div>
      ) : null}

      {job.error ? (
        <p className={styles.jobError} role="alert">
          {job.error}
        </p>
      ) : null}
    </section>
  );
}

/** Atributos de acessibilidade do campo: o erro ligado por aria-describedby. */
function describe(id: string, error: string | undefined) {
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

function ReadOnlyField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} readOnly aria-readonly="true" />
    </div>
  );
}

type FieldProps = { id: string; label: string; error?: string; children: ReactNode };

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
