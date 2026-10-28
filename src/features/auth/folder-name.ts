import { isValidSegment } from "@/features/estudo/folder-path";

const MAX_LENGTH = 40;
const FALLBACK = "usuario";
// Proibidos no Windows (incluindo as barras) e caracteres de controle.
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;
const TRAILING = /[. ]+$/;

/** Nome de pasta seguro no Windows a partir do nome do usuário. */
export function slugFolderName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(FORBIDDEN, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LENGTH)
    .replace(TRAILING, "")
    .replace(/^ +/, "");
  return isValidSegment(cleaned) ? cleaned : FALLBACK;
}

/** Acrescenta " 2", " 3"… até o nome não colidir com `taken` (sem diferenciar maiúsculas). */
export function uniqueFolderName(name: string, taken: string[]): string {
  const used = new Set(taken.map((item) => item.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
