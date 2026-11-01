// Amostra da Configuração: a frase fixa falada com a voz, a velocidade e o volume do formulário (ainda não
// salvos). Passa pelo catálogo (o motor real só aceita voz instalada) e pela mesma fila das tarefas.
import { rejectUnsafePost } from "@/features/ai/route-guard";
import { VoiceError } from "@/features/voz/engine/types";
import { SampleError, synthesizeSample } from "@/features/voz/jobs";
import { parseVoiceSettings } from "@/features/voz/settings-schema";
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

  try {
    const userId = await getCurrentUserId();
    const parsed = parseVoiceSettings(body);
    if (!parsed.ok) {
      const { voice, speed, volume } = parsed.fieldErrors;
      return Response.json({ message: voice ?? speed ?? volume ?? "Dados inválidos." }, { status: 400 });
    }
    const mp3 = await synthesizeSample(userId, parsed.data);
    return new Response(new Uint8Array(mp3), {
      headers: { "Content-Type": "audio/mpeg", "Content-Length": String(mp3.length), "Cache-Control": "no-store" },
    });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    if (error instanceof SampleError) return Response.json({ message: error.message }, { status: error.status });
    if (error instanceof VoiceError) return Response.json({ message: error.message }, { status: 500 });
    console.error("Falha ao gerar a amostra de voz:", error);
    return Response.json({ message: "A geração de voz falhou." }, { status: 500 });
  }
}
