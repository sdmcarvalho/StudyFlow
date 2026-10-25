// Regras puras das imagens do Estudo (sem node:fs): tipo pela assinatura, nome limpo e seguro.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ImageKind = "png" | "jpg" | "gif" | "webp";

const MIN_SIGNATURE_BYTES = 12;
const MAX_STEM_CHARS = 60;

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function startsWith(bytes: Uint8Array, signature: number[] | string, offset = 0): boolean {
  const expected = typeof signature === "string" ? Array.from(signature, (c) => c.charCodeAt(0)) : signature;
  return expected.every((value, index) => bytes[offset + index] === value);
}

/** Tipo da imagem pelo conteúdo (assinatura), nunca pela extensão. `null` para o resto, inclusive SVG. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < MIN_SIGNATURE_BYTES) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, "GIF87a") || startsWith(bytes, "GIF89a")) return "gif";
  if (startsWith(bytes, "RIFF") && startsWith(bytes, "WEBP", 8)) return "webp";
  return null;
}

/** Nome sem extensão, sem acento, espaço nem caracteres especiais (`imagem` quando não sobra nada). */
export function cleanImageStem(originalName: string): string {
  const withoutExtension = originalName.replace(/\.[^.]*$/, "");
  const stem = withoutExtension
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_STEM_CHARS)
    .replace(/^-+|-+$/g, "");
  return stem || "imagem";
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `<nome-limpo>-<AAAAMMDD-HHMMSS>.<ext>`, com a extensão do tipo detectado. */
export function safeImageName(originalName: string, now: Date, kind: ImageKind): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${cleanImageStem(originalName)}-${date}-${time}.${kind}`;
}

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|gif|webp)$/i;
// Nomes de dispositivo do Windows (CON.png abre o console, não um arquivo).
const DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Nome que pode ser lido de `<pasta>\imagens`: só `[A-Za-z0-9._-]`, sem separador e com extensão permitida. */
export function isSafeImageFileName(name: string): boolean {
  return typeof name === "string" && SAFE_FILE_NAME.test(name) && !DEVICE_NAME.test(name);
}

/** Content-Type pela extensão permitida; `null` para qualquer outra (inclusive SVG). */
export function contentTypeFor(fileName: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return (match && CONTENT_TYPES[match[1].toLowerCase()]) || null;
}
