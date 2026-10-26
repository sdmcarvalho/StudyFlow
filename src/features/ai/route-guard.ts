import { isLocalHost } from "@/features/estudo/folder-browser";
import { isSameOrigin } from "@/lib/same-origin";

const fail = (status: number, message: string) => Response.json({ message }, { status });

/** Proteção dos POST de /api/ai: só neste PC ou na rede local, com Origin do próprio app e corpo JSON.
 *  Devolve a resposta de erro, ou `null` quando a requisição pode seguir. */
export function rejectUnsafePost(request: Request): Response | null {
  if (!isLocalHost(request.headers.get("host")) || !isSameOrigin(request)) {
    return fail(403, "A configuração de IA só funciona neste computador ou na rede local.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail(415, "Envie os dados em JSON.");
  }
  return null;
}
