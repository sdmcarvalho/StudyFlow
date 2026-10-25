// Navegação de pastas do disco para o seletor do campo Pasta. Só para o servidor (node:fs).
// Só lê nomes de pastas e cria subpastas novas: nada aqui lê arquivos, apaga ou sobrescreve.
import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { folderKey, isValidSegment, normalizeFolderPath } from "./folder-path";

export type FolderListing =
  | { ok: true; path: string | null; parent: string | null; folders: string[] }
  | { ok: false; message: string };

export type CreateFolderResult = { ok: true; path: string } | { ok: false; message: string };

export const INVALID_NAME = 'Use um nome de pasta válido, sem \\ / : * ? " < > |.';
export const CREATE_FAILED = "Não foi possível criar a pasta.";
export const NO_PERMISSION = "Sem permissão para abrir esta pasta.";
export const FOLDER_EXISTS = "Já existe uma pasta com esse nome.";
export const OPEN_FAILED = "Não foi possível abrir esta pasta.";
export const SLOW_FOLDER = "A pasta demorou para responder. Tente de novo.";

const DRIVE_QUERY_TIMEOUT_MS = 5000;
const FOLDER_TIMEOUT_MS = 5000;

const execFileAsync = promisify(execFile);

// Pastas de sistema que o Explorer também esconde.
const SYSTEM_FOLDER = /^(\$|system volume information$)/i;

function errorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
}

/** `promise`, ou `fallback` se não responder em `ms` (unidade de rede fora do ar não trava o seletor). */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    const settle = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    promise.then(settle, () => settle(fallback));
  });
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Letras de unidade do Windows, uma por linha. Pergunta ao sistema em vez de acessar cada unidade:
 * um `stat` numa unidade de rede fora do ar prende uma thread de E/S do Node por minutos.
 */
async function queryDrives(): Promise<string> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "[System.IO.DriveInfo]::GetDrives() | ForEach-Object Name"],
    { timeout: DRIVE_QUERY_TIMEOUT_MS, windowsHide: true },
  );
  return stdout;
}

/** Unidades do PC, como `C:\`, em ordem. Falha na consulta devolve lista vazia (o campo de texto continua valendo). */
export async function listDrives(query: () => Promise<string> = queryDrives): Promise<string[]> {
  let output: string;
  try {
    output = await query();
  } catch {
    return [];
  }
  const letters = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Za-z]):\\?$/.exec(line.trim());
    if (match) letters.add(`${match[1].toUpperCase()}:\\`);
  }
  return [...letters].sort();
}

/** Pai de uma pasta, ou `null` na raiz de uma unidade ou de um compartilhamento UNC. */
function parentOf(folder: string): string | null {
  const parent = path.win32.dirname(folder);
  const root = path.win32.parse(folder).root;
  return parent === folder || folder.length <= root.length || parent.length < root.length ? null : parent;
}

type ListOptions = { timeoutMs?: number; readdir?: (folder: string) => Promise<Dirent[]> };

const readEntries = (folder: string) => fs.readdir(folder, { withFileTypes: true });

/**
 * Subpastas de `input`. Se a pasta não existir, sobe até a pasta existente mais próxima; se nem a
 * unidade existir, devolve `path: null` (o seletor mostra a lista de unidades). Uma pasta que não
 * responde em `timeoutMs` devolve a mensagem de demora.
 */
export async function listFolder(input: string, options: ListOptions = {}): Promise<FolderListing> {
  const normalized = normalizeFolderPath(input);
  if (!normalized.ok) return normalized;
  const slow: FolderListing = { ok: false, message: SLOW_FOLDER };
  return withTimeout(sharedListing(normalized.path, options.readdir ?? readEntries), options.timeoutMs ?? FOLDER_TIMEOUT_MS, slow);
}

// Leituras em andamento por pasta: uma pasta de rede travada prende uma thread de E/S até o sistema
// desistir, então pedidos repetidos esperam a mesma leitura em vez de prender outra.
const pendingListings = new Map<string, Promise<FolderListing>>();

function sharedListing(start: string, readdir: (folder: string) => Promise<Dirent[]>): Promise<FolderListing> {
  const key = folderKey(start);
  const pending = pendingListings.get(key);
  if (pending) return pending;
  const listing = readListing(start, readdir).finally(() => pendingListings.delete(key));
  pendingListings.set(key, listing);
  return listing;
}

async function readListing(start: string, readdir: (folder: string) => Promise<Dirent[]>): Promise<FolderListing> {
  let current: string | null = start;
  while (current !== null && !(await isDirectory(current))) current = parentOf(current);
  if (current === null) return { ok: true, path: null, parent: null, folders: [] };

  let entries;
  try {
    entries = await readdir(current);
  } catch (error) {
    const code = errorCode(error);
    return { ok: false, message: code === "EACCES" || code === "EPERM" ? NO_PERMISSION : OPEN_FAILED };
  }

  // Atalhos e junções (isSymbolicLink) ficam de fora: podem apontar para fora ou formar ciclos.
  const folders = entries
    .filter((entry) => entry.isDirectory() && !SYSTEM_FOLDER.test(entry.name) && isValidSegment(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  return { ok: true, path: current, parent: parentOf(current), folders };
}

/** Cria `<parent>\<name>` (sem criar intermediárias e sem sobrescrever) e devolve o caminho completo. */
export async function createSubfolder(parent: string, rawName: string): Promise<CreateFolderResult> {
  const name = rawName.trim();
  if (!isValidSegment(name) || name.includes("\\") || name.includes("/")) return { ok: false, message: INVALID_NAME };

  const base = normalizeFolderPath(parent);
  if (!base.ok) return base;
  const target = normalizeFolderPath(path.win32.join(base.path, name));
  if (!target.ok) return target;

  try {
    await fs.mkdir(target.path);
    return { ok: true, path: target.path };
  } catch (error) {
    return { ok: false, message: errorCode(error) === "EEXIST" ? FOLDER_EXISTS : CREATE_FAILED };
  }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIpv4(host: string): boolean {
  const match = IPV4.exec(host);
  if (!match) return false;
  const [a, b, c, d] = match.slice(1).map(Number);
  if ([a, b, c, d].some((octet) => octet > 255)) return false;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/**
 * O cabeçalho Host aponta para este PC ou para a rede local (localhost, IP privado, nome `.local`)?
 * Bloqueia sites externos (DNS rebinding) e acessos por domínio público; o Next não expõe o IP de
 * quem faz a requisição, então um programa na rede que forje o Host não é barrado por aqui.
 */
export function isLocalHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  let host = hostHeader.trim().toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return false;
    host = host.slice(1, end);
    return host === "::1" || /^fe[89ab][0-9a-f]?:/.test(host) || /^f[cd][0-9a-f]{0,2}:/.test(host);
  }
  host = host.replace(/:\d+$/, "");
  if (host === "localhost" || /^[a-z0-9-]+\.local$/.test(host)) return true;
  return isPrivateIpv4(host);
}
