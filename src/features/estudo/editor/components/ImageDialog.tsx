"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cleanImageStem } from "../../images";
import { imageMarkdown } from "../markdown-format";
import { uploadImage } from "../upload";
import styles from "./ImageDialog.module.css";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const URL_REQUIRED = "Informe o endereço da imagem.";
const URL_SCHEME = "Use um endereço http ou https.";
const FILE_REQUIRED = "Escolha uma imagem do computador.";

type Tab = "url" | "upload";

const TABS: { value: Tab; label: string }[] = [
  { value: "url", label: "URL" },
  { value: "upload", label: "Enviar do computador" },
];

type ImageDialogProps = {
  open: boolean;
  studyId: string;
  onClose: () => void;
  /** Recebe o Markdown pronto (`![alt](src)`) para inserir na célula. */
  onInsert: (markdown: string) => void;
};

export function ImageDialog({ open, studyId, onClose, onInsert }: ImageDialogProps) {
  return (
    <Modal open={open} title="Inserir imagem" onClose={onClose}>
      <ImageForm studyId={studyId} onClose={onClose} onInsert={onInsert} />
    </Modal>
  );
}

/** Endereço `http(s)` normalizado, sem parênteses que fechariam o token; `null` para o resto. */
function normalizeHttpUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

type Upload =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; path: string }
  | { status: "failed"; message: string };

// Montado só enquanto o diálogo está aberto: o estado reinicia a cada abertura.
function ImageForm({ studyId, onClose, onInsert }: Omit<ImageDialogProps, "open">) {
  const baseId = useId();
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [upload, setUpload] = useState<Upload>({ status: "idle" });
  const [fileError, setFileError] = useState<string | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ url: null, upload: null });
  // Só a resposta do último arquivo escolhido conta; fechar o diálogo descarta a que estiver pendente.
  const requestRef = useRef(0);

  useEffect(() => {
    return () => {
      requestRef.current += 1;
    };
  }, []);

  const sending = upload.status === "sending";
  const urlId = `${baseId}-url`;
  const altId = `${baseId}-alt`;
  const fileId = `${baseId}-file`;
  const panelId = (value: Tab) => `${baseId}-panel-${value}`;
  const tabId = (value: Tab) => `${baseId}-tab-${value}`;

  function selectTab(next: Tab, focus = false) {
    setTab(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((item) => item.value === tab);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    selectTab(TABS[next].value, true);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setAlt(cleanImageStem(file.name));
    setUpload({ status: "sending" });
    const request = ++requestRef.current;
    const result = await uploadImage(studyId, file);
    if (request !== requestRef.current) return;
    setUpload(result.ok ? { status: "done", path: result.path } : { status: "failed", message: result.message });
  }

  function insert(markdown: string) {
    onInsert(markdown);
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tab === "url") {
      if (url.trim() === "") {
        setUrlError(URL_REQUIRED);
        return;
      }
      const src = normalizeHttpUrl(url.trim());
      if (!src) {
        setUrlError(URL_SCHEME);
        return;
      }
      insert(imageMarkdown(alt, src));
      return;
    }

    if (upload.status === "done") insert(imageMarkdown(alt, upload.path));
    else if (upload.status === "idle") setFileError(FILE_REQUIRED);
    // Falha: a mensagem do servidor já está no diálogo e nada é inserido.
  }

  const uploadMessage = upload.status === "failed" ? upload.message : fileError;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div role="tablist" aria-label="Origem da imagem" className={styles.tabs}>
        {TABS.map((item) => {
          const active = item.value === tab;
          return (
            <button
              key={item.value}
              ref={(element) => {
                tabRefs.current[item.value] = element;
              }}
              id={tabId(item.value)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId(item.value)}
              tabIndex={active ? 0 : -1}
              className={`${styles.tab} ${active ? styles.activeTab : ""}`}
              onClick={() => selectTab(item.value)}
              onKeyDown={handleTabKeyDown}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div id={panelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)} className={styles.panel}>
        {tab === "url" ? (
          <div className={`${styles.field} ${urlError ? styles.hasError : ""}`}>
            <label htmlFor={urlId}>Endereço da imagem</label>
            <input
              id={urlId}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={url}
              aria-invalid={urlError ? true : undefined}
              aria-describedby={urlError ? `${urlId}-error` : undefined}
              onChange={(event) => {
                setUrl(event.target.value);
                setUrlError(null);
              }}
            />
            {urlError ? (
              <span id={`${urlId}-error`} className={styles.error}>
                {urlError}
              </span>
            ) : null}
          </div>
        ) : (
          <div className={`${styles.field} ${uploadMessage ? styles.hasError : ""}`}>
            <label htmlFor={fileId}>Arquivo de imagem</label>
            <input
              id={fileId}
              type="file"
              accept={ACCEPT}
              className={styles.file}
              aria-describedby={uploadMessage ? `${fileId}-error` : undefined}
              onChange={handleFile}
            />
            <span className={styles.hint}>PNG, JPG, GIF ou WebP, até 10 MB.</span>
            {sending ? (
              <span className={styles.status} role="status">
                Enviando…
              </span>
            ) : null}
            {uploadMessage ? (
              <span id={`${fileId}-error`} className={styles.error} role="alert">
                {uploadMessage}
              </span>
            ) : null}
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor={altId}>Texto alternativo</label>
          <input
            id={altId}
            value={alt}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => setAlt(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={sending}>
          Inserir
        </Button>
      </div>
    </form>
  );
}
