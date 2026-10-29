// Isolamento das pastas dos Estudos: cada usuário só enxerga e grava dentro de `<base>\<folderName>`
// (ou `<base>/<folderName>` no POSIX). Só para o servidor (node:fs). O app só cria pastas: nada aqui
// apaga ou sobrescreve o que existe no disco.
import fs from "node:fs/promises";
import { flavorOf, isInsideFolder, joinFolder, normalizeFolderPath } from "./folder-path";
import { baseFolder, ensureFolder } from "./folders";
import { pathApi } from "./path-api";

/** Raiz das pastas do usuário: `<STUDYFLOW_BASE_DIR>\<folderName>`, com o separador do sabor da base. */
export function userRoot(user: { folderName: string }, base: string = baseFolder()): string {
  return joinFolder(base, user.folderName);
}

/**
 * `target` é a própria raiz ou fica dentro dela? Comparação pura de texto (sem tocar o disco):
 * normaliza os dois caminhos e exige o separador depois da raiz, então `C:\S\ana2` não está dentro de
 * `C:\S\ana`. Ignora maiúsculas no Windows; no POSIX diferencia (`/s/ANA` não está em `/s/ana`).
 * Segmentos `..`, caminhos relativos, outras unidades e caminhos de outro sabor ficam fora.
 */
export function isInsideRoot(root: string, target: string): boolean {
  return isInsideFolder(root, target);
}

/**
 * Caminho real (links e junções resolvidos) de `target`, mesmo que ele ainda não exista: resolve o
 * ancestral existente mais profundo e reanexa o que falta. `null` se nem a unidade responde.
 * `target` já vem normalizado (tem sabor); a API de caminhos é a do sabor dele, não a do sistema.
 */
async function resolveReal(target: string): Promise<string | null> {
  const flavor = flavorOf(target);
  if (flavor === null) return null;
  const api = pathApi(flavor);
  let current = target;
  const missing: string[] = [];
  for (;;) {
    try {
      return api.join(await fs.realpath(current), ...missing);
    } catch (error) {
      const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== "ENOENT" && code !== "ENOTDIR") return null;
    }
    const parent = api.dirname(current);
    if (parent === current) return null;
    missing.unshift(api.basename(current));
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
