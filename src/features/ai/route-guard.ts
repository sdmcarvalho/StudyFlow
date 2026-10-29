import { isSameOrigin } from "@/lib/same-origin";

const fail = (status: number, message: string) => Response.json({ message }, { status });

/** Proteção dos POST de /api/ai: Origin do próprio app e corpo JSON (a sessão é checada depois, em `resolveAiConfig`).
 *  Devolve a resposta de erro, ou `null` quando a requisição pode seguir. */
export function rejectUnsafePost(request: Request): Response | null {
  if (!isSameOrigin(request)) return fail(403, "Origem não permitida.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail(415, "Envie os dados em JSON.");
  }
  return null;
}
