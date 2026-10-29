// Pastas dos Estudos no disco. Só para o servidor (node:fs): componentes cliente nunca importam
// este módulo; as regras puras do caminho ficam em folder-path.ts.
// O app só cria pastas e arquivos: nada aqui apaga ou sobrescreve o que já existe no disco.
import { constants } from "node:fs";
import fs from "node:fs/promises";
import { flavorOf, joinFolder, normalizeFolderPath } from "./folder-path";
import { isForeignPath, platformFlavor } from "./path-api";

const DEFAULT_BASE_DIR = { win32: "C:\\StudyFlow", posix: "/var/lib/studyflow" } as const;

/**
 * Pasta base dos Estudos: `STUDYFLOW_BASE_DIR` (normalizada quando válida) ou o padrão da plataforma
 * (`C:\StudyFlow` no Windows, `/var/lib/studyflow` nas demais). Lança se a variável for de outro sabor
 * que o da plataforma (ex.: `C:\Estudos` num servidor Linux): é configuração errada, não um caminho.
 */
export function baseFolder(platform: NodeJS.Platform = process.platform): string {
  const flavor = platformFlavor(platform);
  const value = process.env.STUDYFLOW_BASE_DIR?.trim();
  if (!value) return DEFAULT_BASE_DIR[flavor];
  const valueFlavor = flavorOf(value);
  if (valueFlavor !== null && valueFlavor !== flavor) {
    throw new Error(
      `STUDYFLOW_BASE_DIR (${value}) é um caminho ${valueFlavor === "win32" ? "do Windows" : "POSIX"}, ` +
        `mas o servidor roda em ${flavor === "win32" ? "Windows" : "um sistema POSIX"}.`,
    );
  }
  const normalized = normalizeFolderPath(value);
  return normalized.ok ? normalized.path : value;
}

/**
 * Nomes de tudo o que já existe direto dentro da pasta base. O app não apaga pastas de usuários
 * excluídos; ao escolher a pasta de um usuário novo esses nomes contam como ocupados, para ele não
 * herdar os dados de outra pessoa. Pasta base inexistente (ou que não é pasta) = lista vazia.
 */
export async function existingBaseFolderNames(): Promise<string[]> {
  try {
    return (await fs.readdir(baseFolder(), { withFileTypes: true })).map((entry) => entry.name);
  } catch (error) {
    if (isErrorCode(error, "ENOENT") || isErrorCode(error, "ENOTDIR")) return [];
    throw error;
  }
}

/** `<pasta>\imagens` (ou `<pasta>/imagens` no POSIX), onde ficam as imagens do Estudo. */
export function imagesDir(folder: string): string {
  return joinFolder(folder, "imagens");
}

/**
 * Cria a pasta (e as intermediárias) se não existir. `false` quando não é possível, sem lançar.
 * Caminho de outro sabor que o da plataforma (ex.: `/x` no Windows, que viraria `C:\x`) nem chega ao disco.
 */
export async function ensureFolder(folder: string): Promise<boolean> {
  if (isForeignPath(folder)) return false;
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
  // Caminho de outro sabor que o da plataforma seria lido/gravado em outro lugar: não copia nada.
  if (isForeignPath(fromFolder) || isForeignPath(toFolder)) return;
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
      await fs.copyFile(joinFolder(source, entry.name), joinFolder(target, entry.name), constants.COPYFILE_EXCL);
    } catch (error) {
      if (!isErrorCode(error, "EEXIST")) throw error;
    }
  }
}
