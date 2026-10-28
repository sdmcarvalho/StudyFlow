const LOGIN_PATH = /^\/login(?:[/?#]|$)/i;
// Navegadores removem tab/quebra de linha de URLs ("/\t/evil.com" viraria "//evil.com").
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Aceita só caminhos internos (começam com "/", nunca "//" nem "/\"); nunca devolve a tela de login. */
export function safeNext(value: unknown, fallback = "/estudo"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (CONTROL_CHARS.test(value) || LOGIN_PATH.test(value)) return fallback;
  return value;
}
