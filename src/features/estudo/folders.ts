// Pastas dos Estudos no disco. Só para o servidor (node:fs): componentes cliente nunca importam
// este módulo; as regras puras do caminho ficam em folder-path.ts.
// O app só cria pastas e arquivos: nada aqui apaga ou sobrescreve o que já existe no disco.
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeFolderPath } from "./folder-path";

const DEFAULT_BASE_DIR = "C:\\StudyFlow";

/** Pasta base dos Estudos: `STUDYFLOW_BASE_DIR` (normalizada quando válida) ou `C:\StudyFlow`. */
export function baseFolder(): string {
  const value = process.env.STUDYFLOW_BASE_DIR?.trim();
  if (!value) return DEFAULT_BASE_DIR;
  const normalized = normalizeFolderPath(value);
  return normalized.ok ? normalized.path : value;
}

/** `<pasta>\imagens`, onde ficam as imagens do Estudo. */
export function imagesDir(folder: string): string {
  return path.win32.join(folder, "imagens");
}

/** Cria a pasta (e as intermediárias) se não existir. `false` quando não é possível, sem lançar. */
export async function ensureFolder(folder: string): Promise<boolean> {
  try {
    await fs.mkdir(folder, { recursive: true });
    return (await fs.stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

/**
 * Copia os arquivos de `<from>\imagens` para `<to>\imagens` sem sobrescrever os que já existem no
 * destino. Sem `imagens` na origem não faz nada. A origem fica intacta.
 */
export async function copyImages(fromFolder: string, toFolder: string): Promise<void> {
  const source = imagesDir(fromFolder);
  let entries;
  try {
    entries = await fs.readdir(source, { withFileTypes: true });
  } catch (error) {
    if (isErrorCode(error, "ENOENT") || isErrorCode(error, "ENOTDIR")) return;
    throw error;
  }

  const target = imagesDir(toFolder);
  await fs.mkdir(target, { recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      // COPYFILE_EXCL: falha com EEXIST em vez de sobrescrever um arquivo do destino.
      await fs.copyFile(path.join(source, entry.name), path.join(target, entry.name), constants.COPYFILE_EXCL);
    } catch (error) {
      if (!isErrorCode(error, "EEXIST")) throw error;
    }
  }
}
