const HTTP_URL = /^https?:\/\/[^/\\]/i;
const RELATIVE_PREFIX = "imagens/";
// Barras, dois-pontos e caracteres de controle nunca fazem parte de um nome seguro.
const UNSAFE_NAME_CHAR = /[/\\:\u0000-\u001f\u007f]/;

/**
 * Converte o `src` de uma imagem do Markdown no endereço que o navegador pode carregar.
 *
 * - `imagens/<arquivo>` → `/estudo/<id>/imagens/<arquivo>` (um único segmento seguro);
 * - `http(s)://…` → sem mudança;
 * - qualquer outro esquema, caminho absoluto, `..` ou vazio → `null`.
 */
export function resolveImageSrc(src: string, studyId: string): string | null {
  if (!src) return null;

  if (HTTP_URL.test(src)) {
    try {
      new URL(src);
      return src;
    } catch {
      return null;
    }
  }

  if (!src.startsWith(RELATIVE_PREFIX)) return null;

  let name: string;
  try {
    name = decodeURIComponent(src.slice(RELATIVE_PREFIX.length));
  } catch {
    return null;
  }

  if (!name || name.startsWith(".") || name.includes("..") || UNSAFE_NAME_CHAR.test(name)) {
    return null;
  }

  return `/estudo/${encodeURIComponent(studyId)}/imagens/${encodeURIComponent(name)}`;
}
