"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { createFolder, fetchFolder, type FolderView, type FolderViewResult } from "../folder-api";
import styles from "./FolderPicker.module.css";

type FolderPickerProps = {
  /** Pasta onde o seletor abre; se não existir, o servidor sobe até a mais próxima que existe. */
  initialPath: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
};

type Crumb = { label: string; path: string };

/** Trechos clicáveis do caminho: a raiz (`C:\` ou `\\servidor\pasta`) e cada subpasta. */
function crumbsOf(path: string): Crumb[] {
  const unc = /^\\\\[^\\]+\\[^\\]+/.exec(path);
  const root = unc ? unc[0] : path.slice(0, 3);
  const crumbs: Crumb[] = [{ label: root, path: root }];
  let current = root;
  for (const segment of path.slice(root.length).split("\\")) {
    if (segment === "") continue;
    current = current.endsWith("\\") ? `${current}${segment}` : `${current}\\${segment}`;
    crumbs.push({ label: segment, path: current });
  }
  return crumbs;
}

const driveOf = (path: string | null) => (path && /^[A-Za-z]:\\/.test(path) ? `${path[0].toUpperCase()}:\\` : "");

/** Navegador de pastas do disco, mostrado no lugar do formulário do modal. */
export function FolderPicker({ initialPath, onSelect, onCancel }: FolderPickerProps) {
  const [view, setView] = useState<FolderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Só a resposta do pedido mais recente vale (cliques rápidos em pastas diferentes).
  const requestId = useRef(0);

  const hasView = useRef(false);

  function apply(id: number, result: FolderViewResult) {
    if (id !== requestId.current) return;
    if (result.ok) {
      hasView.current = true;
      setView(result.view);
      setLoading(false);
      return;
    }
    setError(result.message);
    // Sem nada para mostrar (caminho inicial inválido): cai na lista de unidades, mantendo o erro.
    if (!hasView.current) void fetchFolder(null).then((drives) => (drives.ok ? apply(id, drives) : setLoading(false)));
    else setLoading(false);
  }

  function navigate(caminho: string | null) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    void fetchFolder(caminho).then((result) => apply(id, result));
  }

  useEffect(() => {
    const id = ++requestId.current;
    void fetchFolder(initialPath).then((result) => apply(id, result));
    rootRef.current?.focus();
    // Só na abertura: navegações seguintes passam por navigate().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A lista é trocada a cada navegação: o foco que estava num item removido volta para a lista.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || root.contains(document.activeElement) && document.activeElement !== root) return;
    listRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [view]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    // Fecha só o seletor (ou só o campo de nova pasta). No Next a raiz do React é o document, onde o
    // Modal também escuta: stopPropagation não o alcança, por isso o Esc sai marcado com preventDefault.
    event.preventDefault();
    event.stopPropagation();
    if (creating) {
      setCreating(false);
      setNewName("");
    } else {
      onCancel();
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : Math.max(index - 1, 0);
    event.preventDefault();
    buttons[next]?.focus();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!view?.path) return;
    const result = await createFolder(view.path, newName);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCreating(false);
    setNewName("");
    navigate(result.path);
  }

  const path = view?.path ?? null;

  return (
    <div ref={rootRef} className={styles.picker} tabIndex={-1} onKeyDown={handleKeyDown}>
      <div className={styles.bar}>
        <label className={styles.drive}>
          <span>Unidade</span>
          <select value={driveOf(path)} onChange={(event) => navigate(event.target.value)}>
            {driveOf(path) === "" ? <option value="">—</option> : null}
            {(view?.drives ?? []).map((drive) => (
              <option key={drive} value={drive}>
                {drive}
              </option>
            ))}
          </select>
        </label>
        {path ? (
          <nav aria-label="Caminho" className={styles.crumbs}>
            {crumbsOf(path).map((crumb, index, all) => (
              <span key={crumb.path} className={styles.crumb}>
                {index > 0 ? <span aria-hidden="true">›</span> : null}
                <button type="button" onClick={() => navigate(crumb.path)} aria-current={index === all.length - 1 ? "location" : undefined}>
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
        ) : null}
      </div>

      <p className={styles.current}>
        Pasta atual: <output>{path ?? "Unidades"}</output>
      </p>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      <ul ref={listRef} aria-label="Subpastas" aria-busy={loading} className={styles.list} onKeyDown={handleListKeyDown}>
        {path === null ? (
          (view?.drives ?? []).map((drive) => (
            <li key={drive}>
              <button type="button" onClick={() => navigate(drive)}>
                <span aria-hidden="true">💽</span> {drive}
              </button>
            </li>
          ))
        ) : (
          <>
            <li>
              <button type="button" aria-label="Pasta acima" onClick={() => navigate(view?.parent ?? null)}>
                <span aria-hidden="true">⬆ ..</span>
              </button>
            </li>
            {(view?.folders ?? []).map((folder) => (
              <li key={folder}>
                <button type="button" onClick={() => navigate(path.endsWith("\\") ? `${path}${folder}` : `${path}\\${folder}`)}>
                  <span aria-hidden="true">📁</span> {folder}
                </button>
              </li>
            ))}
          </>
        )}
      </ul>
      {path !== null && !loading && view?.folders.length === 0 ? <p className={styles.empty}>Nenhuma subpasta.</p> : null}

      {creating ? (
        <form className={styles.create} onSubmit={handleCreate}>
          <label htmlFor="folder-picker-new">Nome da nova pasta</label>
          <div className={styles.createRow}>
            <input
              id="folder-picker-new"
              value={newName}
              autoFocus
              maxLength={255}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Button variant="secondary" type="submit">
              Criar
            </Button>
          </div>
        </form>
      ) : null}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => setCreating(true)} disabled={!path || creating} className={styles.newFolder}>
          Nova pasta
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" onClick={() => path && onSelect(path)} disabled={!path || loading}>
          Selecionar esta pasta
        </Button>
      </div>
    </div>
  );
}
