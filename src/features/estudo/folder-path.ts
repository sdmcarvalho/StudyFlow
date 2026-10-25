// Regras puras do caminho da pasta. Sem node:path/node:fs: este módulo também roda no navegador
// (o formulário valida com o mesmo schema do servidor). Criação em disco e unicidade ficam no servidor.

export const MAX_FOLDER_CHARS = 260;

const ABSOLUTE_PATH_MESSAGE = "Informe um caminho absoluto, como C:\\Estudos\\Cálculo.";

export type FolderPathResult = { ok: true; path: string } | { ok: false; message: string };

const invalid = (message: string): FolderPathResult => ({ ok: false, message });

const DRIVE_PREFIX = /^[A-Za-z]:\\/;
const UNC_PREFIX = /^\\\\[^\\]+\\[^\\]+/;
const RESERVED_UNC_NAMES = new Set([".", "..", "?"]);

function hasValidSegments(rest: string): boolean {
  if (rest === "") return true;
  const segments = rest.split("\\");
  if (segments[segments.length - 1] === "") segments.pop(); // barra final
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function normalizeFolderPath(input: string): FolderPathResult {
  const trimmed = input.trim();
  if (trimmed === "") return invalid("Informe uma pasta.");

  const path = trimmed.replaceAll("/", "\\");

  let prefix: string; // raiz da unidade (C:\) ou do compartilhamento UNC (\\servidor\pasta)
  let rest: string;
  const unc = UNC_PREFIX.exec(path);
  if (DRIVE_PREFIX.test(path)) {
    prefix = path.slice(0, 3);
    rest = path.slice(3);
  } else if (unc) {
    prefix = unc[0];
    // servidor e compartilhamento também não podem ser ".", ".." ou "?" (namespaces \\.\ e \\?\ do Win32)
    const [server, share] = prefix.slice(2).split("\\");
    if (RESERVED_UNC_NAMES.has(server) || RESERVED_UNC_NAMES.has(share)) return invalid(ABSOLUTE_PATH_MESSAGE);
    rest = path.slice(prefix.length + 1); // pula a barra que separa o compartilhamento do resto
  } else {
    return invalid(ABSOLUTE_PATH_MESSAGE);
  }

  if (!hasValidSegments(rest)) return invalid(ABSOLUTE_PATH_MESSAGE);

  const body = rest.endsWith("\\") ? rest.slice(0, -1) : rest;
  const separator = prefix.endsWith("\\") || body === "" ? "" : "\\";
  const normalized = `${prefix}${separator}${body}`;

  if (normalized.length > MAX_FOLDER_CHARS) return invalid(`Use no máximo ${MAX_FOLDER_CHARS} caracteres.`);
  return { ok: true, path: normalized };
}

/** Chave de comparação: caminho normalizado em minúsculas (o Windows ignora maiúsculas/minúsculas). */
export function folderKey(path: string): string {
  const result = normalizeFolderPath(path);
  return (result.ok ? result.path : path.trim()).toLowerCase();
}
