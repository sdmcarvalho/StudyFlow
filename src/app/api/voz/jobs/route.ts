// Cria uma tarefa de voz (Ler ou Gravar) para um intervalo de células de um Estudo do usuário.
// O texto vem do banco (getStudyDocument), nunca do corpo; o corpo só diz qual Estudo, intervalo e modo.
import { rejectUnsafePost } from "@/features/ai/route-guard";
import { createJob, type JobMode } from "@/features/voz/jobs";
import { authErrorResponse } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";

export async function POST(request: Request): Promise<Response> {
  const rejected = rejectUnsafePost(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Envie os dados em JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ message: "Dados inválidos." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  try {
    const userId = await getCurrentUserId();
    const result = await createJob(userId, {
      studyId: input.studyId as string,
      start: input.start,
      end: input.end,
      mode: input.mode as JobMode,
    });
    if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
    return Response.json({ id: result.id });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    console.error("Falha ao criar a tarefa de voz:", error);
    return Response.json({ message: "Não foi possível iniciar a voz." }, { status: 500 });
  }
}
