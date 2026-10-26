/** Origin, quando o navegador envia, precisa ser o próprio app (mesmo Host): barra formulários de outros sites. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
