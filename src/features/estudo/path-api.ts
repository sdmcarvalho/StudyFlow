// API de caminhos do Node escolhida pelo sabor do caminho (nunca pelo sistema em que o servidor roda).
// Só para o servidor: as regras puras (sem node:path) ficam em folder-path.ts.
import path from "node:path";
import { flavorOf, type PathFlavor } from "./folder-path";

/** `path.win32` ou `path.posix`, conforme o sabor. */
export function pathApi(flavor: PathFlavor): typeof path.win32 | typeof path.posix {
  return flavor === "win32" ? path.win32 : path.posix;
}

/** Sabor dos caminhos que o disco desta plataforma entende: win32 no Windows, posix nas demais. */
export function platformFlavor(platform: NodeJS.Platform = process.platform): PathFlavor {
  return platform === "win32" ? "win32" : "posix";
}

/**
 * `folder` é de um sabor conhecido diferente do da plataforma? No Windows, `/x` viraria `C:\x`; no
 * Linux, `C:\x` viraria um nome relativo à pasta de trabalho. Quem acessa o disco recusa esses caminhos.
 */
export function isForeignPath(folder: string, platform: NodeJS.Platform = process.platform): boolean {
  const flavor = flavorOf(folder);
  return flavor !== null && flavor !== platformFlavor(platform);
}
