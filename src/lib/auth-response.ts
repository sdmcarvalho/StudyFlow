import { isAuthError } from "@/lib/current-user";

export const SESSION_EXPIRED_MESSAGE = "Sessão expirada, entre novamente.";
export const FORBIDDEN_MESSAGE = "Acesso negado.";

/** Resposta JSON (401/403) para um AuthError; null para qualquer outro erro. */
export function authErrorResponse(error: unknown): Response | null {
  if (!isAuthError(error)) return null;
  if (error.code === "forbidden") {
    return Response.json({ message: FORBIDDEN_MESSAGE }, { status: 403 });
  }
  return Response.json({ message: SESSION_EXPIRED_MESSAGE }, { status: 401 });
}

/** Mensagem para actions (que devolvem `{ ok: false, message }`); null se não for AuthError. */
export function authActionMessage(error: unknown): string | null {
  if (!isAuthError(error)) return null;
  return error.code === "forbidden" ? FORBIDDEN_MESSAGE : SESSION_EXPIRED_MESSAGE;
}
