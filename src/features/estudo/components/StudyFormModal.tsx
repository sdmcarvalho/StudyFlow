"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { todayIso } from "@/lib/dates";
import { createStudyRecord, updateStudyRecord } from "../actions";
import type { StudyRecordRow } from "../list";
import { MAX_FOLDER_CHARS, normalizeFolderPath, withTrailingSeparator } from "../folder-path";
import { parseStudyRecordInput, type FieldErrors } from "../schema";
import { FolderPicker } from "./FolderPicker";
import styles from "./StudyFormModal.module.css";

const SAVE_FAILED = "Não foi possível salvar. Tente novamente.";

type StudyFormModalProps = {
  open: boolean;
  record: StudyRecordRow | null;
  /** Pasta base; um novo Estudo começa com `<baseDir>` mais o separador do sistema no campo Pasta. */
  baseDir: string;
  onClose: () => void;
  onSaved: (kind: "created" | "updated") => void;
  onError: (message: string) => void;
};

export function StudyFormModal({ open, record, baseDir, onClose, onSaved, onError }: StudyFormModalProps) {
  return (
    <Modal open={open} title={record ? "Editar registro" : "Novo registro"} onClose={onClose}>
      <StudyForm record={record} baseDir={baseDir} onCancel={onClose} onSaved={onSaved} onError={onError} />
    </Modal>
  );
}

type StudyFormProps = {
  record: StudyRecordRow | null;
  baseDir: string;
  onCancel: () => void;
  onSaved: (kind: "created" | "updated") => void;
  onError: (message: string) => void;
};

// Montado só enquanto o modal está aberto, então o estado reinicia a cada abertura.
function StudyForm({ record, baseDir, onCancel, onSaved, onError }: StudyFormProps) {
  const [descricao, setDescricao] = useState(record?.descricao ?? "");
  const [pasta, setPasta] = useState(record?.pasta ?? withTrailingSeparator(baseDir));
  const [dataInicial, setDataInicial] = useState(record?.dataInicial ?? todayIso());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  // O seletor de pastas aparece no lugar do formulário; o estado dos campos fica aqui e não se perde.
  const [browsing, setBrowsing] = useState(false);
  const [focusAfterBrowse, setFocusAfterBrowse] = useState<"pasta" | "procurar" | null>(null);
  const pastaRef = useRef<HTMLInputElement>(null);
  const browseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusAfterBrowse === "pasta") pastaRef.current?.focus();
    else if (focusAfterBrowse === "procurar") browseRef.current?.focus();
  }, [focusAfterBrowse]);

  function closeBrowser(selected: string | null) {
    if (selected !== null) setPasta(selected);
    setBrowsing(false);
    setFocusAfterBrowse(selected !== null ? "pasta" : "procurar");
  }

  if (browsing) {
    const current = normalizeFolderPath(pasta);
    return (
      <FolderPicker
        initialPath={current.ok ? current.path : baseDir}
        rootPath={baseDir}
        onSelect={(path) => closeBrowser(path)}
        onCancel={() => closeBrowser(null)}
      />
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { descricao, pasta, dataInicial };
    const parsed = parseStudyRecordInput(input);
    if (!parsed.ok) {
      setErrors(parsed.fieldErrors);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const result = record ? await updateStudyRecord(record.id, parsed.data) : await createStudyRecord(parsed.data);
      if (result.ok) onSaved(record ? "updated" : "created");
      else if (result.fieldErrors) setErrors(result.fieldErrors);
      else onError(result.message ?? SAVE_FAILED);
    } catch {
      // A chamada em si pode falhar (rede fora, servidor reiniciado): o modal fica aberto com os dados.
      onError(SAVE_FAILED);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Field id="field-descricao" label="Descrição" error={errors.descricao}>
        <input
          id="field-descricao"
          value={descricao}
          maxLength={80}
          required
          aria-invalid={errors.descricao ? true : undefined}
          aria-describedby={errors.descricao ? "field-descricao-error" : undefined}
          onChange={(event) => setDescricao(event.target.value)}
        />
      </Field>
      <Field id="field-pasta" label="Pasta" error={errors.pasta}>
        <div className={styles.withButton}>
          <input
            ref={pastaRef}
            id="field-pasta"
            value={pasta}
            maxLength={MAX_FOLDER_CHARS}
            required
            aria-invalid={errors.pasta ? true : undefined}
            aria-describedby={errors.pasta ? "field-pasta-error" : undefined}
            onChange={(event) => setPasta(event.target.value)}
          />
          <Button
            ref={browseRef}
            variant="secondary"
            onClick={() => {
              setFocusAfterBrowse(null);
              setBrowsing(true);
            }}
          >
            Procurar…
          </Button>
        </div>
      </Field>
      <Field id="field-data" label="Data inicial" error={errors.dataInicial}>
        <input
          id="field-data"
          type="date"
          value={dataInicial}
          required
          aria-invalid={errors.dataInicial ? true : undefined}
          aria-describedby={errors.dataInicial ? "field-data-error" : undefined}
          onChange={(event) => setDataInicial(event.target.value)}
        />
      </Field>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={pending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

type FieldProps = { id: string; label: string; error?: string; children: React.ReactNode };

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-error`} className={styles.error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
