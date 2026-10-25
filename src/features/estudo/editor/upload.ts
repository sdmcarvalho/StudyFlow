export const UPLOAD_FAILED = "Não foi possível salvar a imagem.";

export type UploadResult = { ok: true; path: string; alt: string } | { ok: false; message: string };

// Só aceita o caminho relativo que a rota gera: `imagens/<nome-seguro>`.
const SAVED_PATH = /^imagens\/[A-Za-z0-9._-]+$/;

/**
 * Envia a imagem para `POST /estudo/<id>/imagens`. Nunca lança: rede fora, corpo que não é
 * JSON ou resposta inesperada viram `UPLOAD_FAILED`; erros com `{ message }` repassam a mensagem.
 */
export async function uploadImage(studyId: string, file: File): Promise<UploadResult> {
  const body = new FormData();
  body.append("file", file);

  let data: unknown;
  let ok: boolean;
  try {
    const response = await fetch(`/estudo/${encodeURIComponent(studyId)}/imagens`, { method: "POST", body });
    ok = response.ok;
    data = await response.json();
  } catch {
    return { ok: false, message: UPLOAD_FAILED };
  }

  if (typeof data !== "object" || data === null) return { ok: false, message: UPLOAD_FAILED };
  const record = data as Record<string, unknown>;

  if (ok) {
    const { path, alt } = record;
    if (typeof path !== "string" || !SAVED_PATH.test(path)) return { ok: false, message: UPLOAD_FAILED };
    return { ok: true, path, alt: typeof alt === "string" ? alt : "" };
  }

  const { message } = record;
  return { ok: false, message: typeof message === "string" && message.trim() !== "" ? message : UPLOAD_FAILED };
}
