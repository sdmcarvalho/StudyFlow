const LOGIN_PATH = /^\/login(?:[/?#]|$)/i;
// Navegadores removem tab/quebra de linha de URLs ("/\t/evil.com" viraria "//evil.com").
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_LENGTH = 2048;
const PLACEHOLDER_ORIGIN = "http://x";

/**
 * Aceita só caminhos internos (começam com "/", nunca "//" nem "/\"); nunca devolve a tela de login.
 * Depois dos testes de texto, o valor é canonizado (resolve "." e ".." e "%2e"), porque "/.//evil.com" ou
 * "/estudo/../login" só mostram o que são nessa forma. Devolve caminho + query da forma canônica.
 */
export function safeNext(value: unknown, fallback = "/estudo"): string {
  if (typeof value !== "string" || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (CONTROL_CHARS.test(value) || LOGIN_PATH.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || url.pathname.startsWith("//") || LOGIN_PATH.test(url.pathname)) {
    return fallback;
  }
  return url.pathname + url.search;
}
