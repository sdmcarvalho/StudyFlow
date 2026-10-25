export const MIN_WIDTH = 32;
export const MAX_WIDTH = 2000;
const WIDTH_SUFFIX = /^([\s\S]*)\|(\d+)$/;
const IMAGE_TOKEN = /^!\[([\s\S]*)\]\(([\s\S]*)\)$/;

export function clampWidth(n: number): number {
  if (!Number.isFinite(n)) return MIN_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));
}

export function parseImageAlt(alt: string): {
  alt: string;
  width: number | null;
} {
  const match = WIDTH_SUFFIX.exec(alt);
  if (!match) return { alt, width: null };
  const width = Number(match[2]);
  if (width < 1) return { alt, width: null };
  return { alt: match[1], width: clampWidth(Math.min(width, MAX_WIDTH)) };
}

export function setImageWidth(
  texto: string,
  start: number,
  end: number,
  width: number,
): string {
  const match = IMAGE_TOKEN.exec(texto.slice(start, end));
  if (!match) return texto;
  const { alt } = parseImageAlt(match[1]);
  const token = `![${alt}|${clampWidth(width)}](${match[2]})`;
  return texto.slice(0, start) + token + texto.slice(end);
}
