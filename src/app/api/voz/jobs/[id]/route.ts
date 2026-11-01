// Estado (GET) e cancelamento (DELETE) de uma tarefa de voz. Só o dono enxerga a tarefa; para os outros é 404.
import { cancelJob, getJobStatus } from "@/features/voz/jobs";
import { authErrorResponse } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";
import { isSameOrigin } from "@/lib/same-origin";

type Context = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ message: "Tarefa não encontrada." }, { status: 404 });

function unexpected(error: unknown): Response {
  const response = authErrorResponse(error);
  if (response) return response;
  console.error("Falha na tarefa de voz:", error);
  return Response.json({ message: "Não foi possível consultar a voz." }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const status = getJobStatus(userId, id);
    if (!status) return notFound();
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return unexpected(error);
  }
}

/** Sem corpo (o navegador manda com `keepalive` ao sair da tela), por isso só a origem é conferida. */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ message: "Origem não permitida." }, { status: 403 });
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    if (!cancelJob(userId, id)) return notFound();
    return Response.json({ ok: true });
  } catch (error) {
    return unexpected(error);
  }
}
