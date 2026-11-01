// MP3 de uma célula da tarefa, quando ela já está pronta. Número inválido, célula ainda não pronta (ou sem texto)
// e tarefa de outro usuário dão 404.
import { bytesStream } from "@/features/voz/body";
import { getCellMp3, getJobStatus } from "@/features/voz/jobs";
import { authErrorResponse } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";

type Context = { params: Promise<{ id: string; n: string }> };

const CELL_NUMBER = /^[1-9]\d{0,5}$/;

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  try {
    const userId = await getCurrentUserId();
    const { id, n } = await params;
    if (!getJobStatus(userId, id)) return Response.json({ message: "Tarefa não encontrada." }, { status: 404 });
    const mp3 = typeof n === "string" && CELL_NUMBER.test(n) ? getCellMp3(userId, id, Number(n)) : null;
    if (!mp3) return Response.json({ message: "Esta célula ainda não está pronta." }, { status: 404 });
    // Sem cópia: o MP3 vai em fluxo, direto do Buffer da tarefa.
    return new Response(bytesStream([mp3]), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(mp3.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    console.error("Falha ao ler o áudio da célula:", error);
    return Response.json({ message: "Não foi possível ler o áudio." }, { status: 500 });
  }
}
