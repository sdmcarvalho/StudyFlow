// MP3 completo de uma tarefa do modo Gravar, depois de pronta, como anexo com o nome do audioFileName.
import { bytesStream } from "@/features/voz/body";
import { getFullMp3, getJobStatus } from "@/features/voz/jobs";
import { authErrorResponse } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";

type Context = { params: Promise<{ id: string }> };

/** Nome só com ASCII imprimível para o `filename=` (sem acentos; o resto vira `_`). */
function asciiFallback(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]|["\\]/g, "_");
}

/** Percent-encoding da RFC 5987 (encodeURIComponent deixa passar `'()*`). */
function encodeRfc5987(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Não exportado: arquivo de rota só exporta os métodos HTTP.
function contentDisposition(fileName: string): string {
  return `attachment; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const status = getJobStatus(userId, id);
    if (!status || status.mode !== "gravar") {
      return Response.json({ message: "Tarefa não encontrada." }, { status: 404 });
    }
    const full = status.state === "pronto" ? getFullMp3(userId, id) : null;
    if (!full) return Response.json({ message: "O áudio ainda não está pronto." }, { status: 409 });
    // Sem cópia: os MP3 das células vão em fluxo, direto dos Buffers da tarefa (nada de concatenar nem copiar).
    return new Response(bytesStream(full.parts), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(full.byteLength),
        "Content-Disposition": contentDisposition(full.fileName),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    console.error("Falha ao baixar o áudio:", error);
    return Response.json({ message: "Não foi possível baixar o áudio." }, { status: 500 });
  }
}
