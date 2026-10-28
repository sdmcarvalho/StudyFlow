// Isolamento das pastas dos Estudos: cada usuário só enxerga e grava dentro de `<base>\<folderName>`.
// Só para o servidor (node:fs). O app só cria pastas: nada aqui apaga ou sobrescreve o que existe no disco.
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeFolderPath } from "./folder-path";
import { baseFolder, ensureFolder } from "./folders";

/** Raiz das pastas do usuário: `<STUDYFLOW_BASE_DIR>\<folderName>`. */
export function userRoot(user: { folderName: string }): string {
  return path.win32.join(baseFolder(), user.folderName);
}

/**
 * `target` é a própria raiz ou fica dentro dela? Comparação pura de texto (sem tocar o disco):
 * normaliza os dois caminhos, ignora maiúsculas e exige a barra depois da raiz, então `C:\S\ana2`
 * não está dentro de `C:\S\ana`. Segmentos `..`, caminhos relativos e outras unidades ficam fora.
 */
export function isInsideRoot(root: string, target: string): boolean {
  const normalizedRoot = normalizeFolderPath(root);
  const normalizedTarget = normalizeFolderPath(target);
  if (!normalizedRoot.ok || !normalizedTarget.ok) return false;

  const rootKey = normalizedRoot.path.toLowerCase();
  const targetKey = normalizedTarget.path.toLowerCase();
  const prefix = rootKey.endsWith("\\") ? rootKey : `${rootKey}\\`;
  return targetKey === rootKey || targetKey.startsWith(prefix);
}

/**
 * Caminho real (links e junções resolvidos) de `target`, mesmo que ele ainda não exista: resolve o
 * ancestral existente mais profundo e reanexa o que falta. `null` se nem a unidade responde.
 */
async function resolveReal(target: string): Promise<string | null> {
  let current = target;
  const missing: string[] = [];
  for (;;) {
    try {
      return path.win32.join(await fs.realpath(current), ...missing);
    } catch (error) {
      const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "ENOENT" && code !== "ENOTDIR") return null;
    }
    const parent = path.win32.dirname(current);
    if (parent === current) return null;
    missing.unshift(path.win32.basename(current));
    current = parent;
  }
}

/**
 * `target` pode ser usado pelo usuário da raiz `root`? Além de `isInsideRoot`, o caminho real do
 * ancestral existente mais profundo precisa ficar dentro do caminho real da raiz: uma junção ou
 * link simbólico dentro da raiz que aponte para fora é recusado. Pasta que ainda não existe, dentro
 * da raiz, é permitida (e a própria raiz pode ainda não existir).
 */
export async function isFolderAllowed(root: string, target: string): Promise<boolean> {
  if (!isInsideRoot(root, target)) return false;
  const normalizedRoot = normalizeFolderPath(root);
  const normalizedTarget = normalizeFolderPath(target);
  if (!normalizedRoot.ok || !normalizedTarget.ok) return false;

  const [realRoot, realTarget] = await Promise.all([
    resolveReal(normalizedRoot.path),
    resolveReal(normalizedTarget.path),
  ]);
  // Sem como resolver (ex.: unidade ausente) os dois, o teste de texto acima já decidiu; só um deles, recusa.
  if (realRoot === null || realTarget === null) return realRoot === realTarget;
  return isInsideRoot(realRoot, realTarget);
}

/** Cria a raiz do usuário se preciso (nunca apaga nada) e a devolve. */
export async function ensureUserRoot(user: { folderName: string }): Promise<string> {
  const root = userRoot(user);
  await ensureFolder(root);
  return root;
}
